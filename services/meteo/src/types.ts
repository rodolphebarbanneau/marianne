export interface WeatherNow {
  /** Local time, "2026-10-28T17:45". */
  time: string
  temperature: number
  feelsLike: number
  humidity: number
  /** mm */
  precipitation: number
  /** WMO code, and its French label. */
  code: number
  label: string
  /** km/h */
  windSpeed: number
  windGusts: number
  /** Degrees, and the French compass point it blows from ("NO"). */
  windDirection: number
  windFrom: string
  isDay: boolean
}

export interface WeatherDay {
  /** YYYY-MM-DD */
  date: string
  code: number
  label: string
  min: number
  max: number
  /** mm */
  precipitation: number
  /** % (not given by every model). */
  precipitationChance: number | null
  windSpeed: number
  windGusts: number
  windDirection: number
  windFrom: string
  /** Local times, "07:34". */
  sunrise: string
  sunset: string
  /** Météo-France (AROME, ARPEGE) for the first days, then the European model (ECMWF). */
  model: 'meteofrance' | 'ecmwf'
}

export interface Weather {
  latitude: number
  longitude: number
  /** m */
  elevation: number
  now: WeatherNow | null
  days: WeatherDay[]
  /** French credit line to show. */
  credit: string
}

/** A commune, as the search lists it and a forecast names it. */
export interface Place {
  /** INSEE code. */
  code: string
  name: string
  postalCodes: string[]
  department: string
  departmentName: string
}

/** The weather at a commune's centre. */
export interface Forecast extends Weather {
  commune: Place
}

/** What the view calls. */
export type MeteoMethods = {
  /** The weather of a commune (INSEE code): now and the next seven days. */
  forecast(code: string): Forecast
  /** Communes by name, postal code or INSEE code, most populated first. */
  communes(text: string): Place[]
}

/** The view's stored favorites. */
export interface Favorites {
  communes: Array<Pick<Place, 'code' | 'name'>>
}
