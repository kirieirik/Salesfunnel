// Brønnøysundregistrene API
// Dokumentasjon: https://data.brreg.no/enhetsregisteret/api/docs/index.html

const BASE_URL = 'https://data.brreg.no/enhetsregisteret/api'

/**
 * Søk etter enheter basert på navn
 * @param {string} query - Søkeord (bedriftsnavn)
 * @param {number} size - Antall resultater (default 10)
 */
export async function searchByName(query, size = 10) {
  if (!query || query.length < 2) return []
  
  try {
    const response = await fetch(
      `${BASE_URL}/enheter?navn=${encodeURIComponent(query)}&size=${size}`
    )
    
    if (!response.ok) throw new Error('Feil ved søk')
    
    const data = await response.json()
    return data._embedded?.enheter || []
  } catch (error) {
    console.error('Brønnøysund API feil:', error)
    return []
  }
}

/**
 * Søk etter enhet basert på organisasjonsnummer
 * @param {string} orgNr - Organisasjonsnummer (9 siffer)
 */
export async function searchByOrgNr(orgNr) {
  // Fjern mellomrom og sjekk lengde
  const cleanOrgNr = orgNr.replace(/\s/g, '')
  if (cleanOrgNr.length !== 9 || !/^\d+$/.test(cleanOrgNr)) return null
  
  try {
    const response = await fetch(`${BASE_URL}/enheter/${cleanOrgNr}`)
    
    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error('Feil ved oppslag')
    }
    
    return await response.json()
  } catch (error) {
    console.error('Brønnøysund API feil:', error)
    return null
  }
}

/**
 * Søk som prøver både orgnr og navn
 * @param {string} query - Søkeord (orgnr eller navn)
 */
export async function search(query, size = 10) {
  if (!query || query.length < 2) return []
  
  const cleanQuery = query.replace(/\s/g, '')
  
  // Hvis det ser ut som et orgnr (bare tall, 9 siffer)
  if (/^\d{9}$/.test(cleanQuery)) {
    const result = await searchByOrgNr(cleanQuery)
    return result ? [result] : []
  }
  
  // Hvis det er et delvis orgnr (bare tall, mindre enn 9)
  if (/^\d+$/.test(cleanQuery) && cleanQuery.length < 9) {
    // Søk på organisasjonsnummer som starter med disse tallene
    try {
      const response = await fetch(
        `${BASE_URL}/enheter?organisasjonsnummer=${cleanQuery}&size=${size}`
      )
      if (response.ok) {
        const data = await response.json()
        if (data._embedded?.enheter?.length > 0) {
          return data._embedded.enheter
        }
      }
    } catch (error) {
      // Fall back til navnesøk
    }
  }
  
  // Ellers søk på navn
  return searchByName(query, size)
}

/**
 * Formater adresse fra Brønnøysund-data
 * @param {object} enhet - Enhet fra API
 */
export function formatAddress(enhet) {
  const addr = enhet.forretningsadresse || enhet.postadresse
  if (!addr) return ''
  
  const parts = []
  
  if (addr.adresse && addr.adresse.length > 0) {
    parts.push(addr.adresse.join(', '))
  }
  
  if (addr.postnummer && addr.poststed) {
    parts.push(`${addr.postnummer} ${addr.poststed}`)
  }
  
  return parts.join(', ')
}

/**
 * Formater organisasjonsnummer med mellomrom
 * @param {string} orgNr - Organisasjonsnummer
 */
export function formatOrgNr(orgNr) {
  if (!orgNr) return ''
  const clean = orgNr.toString().replace(/\s/g, '')
  if (clean.length !== 9) return orgNr
  return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6, 9)}`
}

/**
 * Hent separate adressefelt fra Brønnøysund-enhet
 * @param {object} enhet - Enhet fra API
 */
export function getAddressParts(enhet) {
  const addr = enhet.forretningsadresse || enhet.postadresse
  if (!addr) return { street: '', postal_code: '', city: '' }
  
  return {
    street: addr.adresse?.[0] || '',
    postal_code: addr.postnummer || '',
    city: addr.poststed || ''
  }
}

/**
 * Hent næringskode/bransje fra enhet
 * @param {object} enhet - Enhet fra API
 */
export function getIndustry(enhet) {
  const naring = enhet.naeringskode1
  if (!naring) return ''
  return naring.beskrivelse || ''
}

/**
 * Hent antall ansatte som tekst
 * @param {object} enhet - Enhet fra API
 */
export function getEmployeeCount(enhet) {
  return enhet.antallAnsatte?.toString() || ''
}

/**
 * Konverter Brønnøysund-enhet til kundedata
 * @param {object} enhet - Enhet fra API
 */
export function toCustomerData(enhet) {
  const addressParts = getAddressParts(enhet)
  
  return {
    name: enhet.navn || '',
    org_nr: formatOrgNr(enhet.organisasjonsnummer),
    address: addressParts.street,
    postal_code: addressParts.postal_code,
    city: addressParts.city,
    industry: getIndustry(enhet),
    employee_count: getEmployeeCount(enhet),
    website: enhet.hjemmeside || '',
    org_form: enhet.organisasjonsform?.beskrivelse || '',
    // Disse feltene finnes ikke i Brønnøysund, men vi beholder de tomme
    email: '',
    phone: '',
    notes: '',
    // Metadata for synkronisering
    brreg_updated_at: new Date().toISOString()
  }
}

/**
 * Hent oppdatert data fra Brønnøysund basert på org.nr
 * @param {string} orgNr - Organisasjonsnummer
 */
export async function fetchCompanyData(orgNr) {
  if (!orgNr) return null
  
  const enhet = await searchByOrgNr(orgNr)
  if (!enhet) return null
  
  return toCustomerData(enhet)
}
