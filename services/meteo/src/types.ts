/** The models a forecast comes from: Météo-France's (AROME, ARPEGE) while they cover it, then the European one (ECMWF IFS). */
export type Model = 'meteofrance' | 'ecmwf'

export interface WeatherNow {
  /** Local time, "2026-10-28T17:45". */
  time: string
  temperature: number
  feelsLike: number
  humidity: number
  /** mm, over the last quarter of an hour. */
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

/** A quarter of an hour to come, from AROME's 15-minute run: when it starts (local time), what falls in it (mm) and its WMO code. */
export interface WeatherQuarter {
  time: string
  precipitation: number
  code: number
}

/** An hour to come. */
export interface WeatherHour {
  /** Local time of its start, "2026-10-28T18:00". */
  time: string
  code: number
  temperature: number
  feelsLike: number
  /** mm, over the hour. */
  precipitation: number
  /** % (the European model's; Météo-France's models give none). */
  precipitationChance: number | null
  humidity: number
  windSpeed: number
  windGusts: number
  windDirection: number
  windFrom: string
  isDay: boolean
  model: Model
}

export interface WeatherDay {
  /** YYYY-MM-DD */
  date: string
  code: number
  label: string
  min: number
  max: number
  feelsLikeMin: number
  feelsLikeMax: number
  /** mm, and the hours with some. */
  precipitation: number
  precipitationHours: number
  /** % (the European model's). */
  precipitationChance: number | null
  windSpeed: number
  windGusts: number
  windDirection: number
  windFrom: string
  /** Local times, "07:34". */
  sunrise: string
  sunset: string
  /** Seconds of daylight. */
  daylight: number
  model: Model
}

export interface Weather {
  latitude: number
  longitude: number
  /** m */
  elevation: number
  now: WeatherNow | null
  /** The next two hours, quarter by quarter, where AROME's 15-minute run reaches (metropolitan France); [] elsewhere. */
  quarters: WeatherQuarter[]
  /** The 48 hours after the current one. */
  hours: WeatherHour[]
  /** Today and the next 14 days. */
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

/** The pollens CAMS forecasts over Europe, in their season. */
export type Pollen = 'alder' | 'birch' | 'grass' | 'mugwort' | 'olive' | 'ragweed'

/** A day of air quality, UV and pollen; null where the model gives nothing. */
export interface AirDay {
  date: string
  /** The European air quality index, its highest hour. */
  aqi: number | null
  /** The UV index, its highest hour. */
  uv: number | null
  /** Grains per m³, the highest hour, for the pollens that are in the air (one grain per m³ or more). */
  pollen: Partial<Record<Pollen, number>>
}

/** Air quality, UV and pollen at a place, from Copernicus (CAMS). */
export interface AirQuality {
  /** Local time of the hour it describes. */
  time: string
  aqi: number | null
  uv: number | null
  days: AirDay[]
  credit: string
}

/** Where most of the European model's scenarios fall for a figure: a tenth below `low`, a tenth above `high`, half each side of `mid`. */
export interface Spread {
  low: number
  mid: number
  high: number
}

export type Confidence = 'high' | 'medium' | 'low'

/** A day as the European model's ensemble sees it. */
export interface TrendDay {
  date: string
  max: Spread
  min: Spread
  /** The share of scenarios (0 to 1) with at least 1 mm of rain. */
  rain: number
  confidence: Confidence
}

/** The days to come as the European model's scenarios (ECMWF IFS ensemble) see them. */
export interface Trend {
  /** How many scenarios. */
  members: number
  days: TrendDay[]
  credit: string
}

/** What the view calls. */
export type MeteoMethods = {
  /** The weather of a commune (INSEE code): now, the next two hours by quarter, the next 48 hours, the next 15 days. */
  forecast(code: string): Forecast
  /** Its air quality, UV and pollen for the next days. */
  air(code: string): AirQuality
  /** The European model's scenarios for its next 15 days: the ranges and the confidence. */
  trend(code: string): Trend
  /** Communes by name, postal code or INSEE code, most populated first. */
  communes(text: string): Place[]
}

/** The view's stored favorites. */
export interface Favorites {
  communes: Array<Pick<Place, 'code' | 'name'>>
}
