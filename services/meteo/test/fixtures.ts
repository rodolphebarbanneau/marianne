import type { Commune } from '@marianne/sdk/main'

/**
 * Open-Meteo's answers for Bordeaux, shortened: the forecast with two models (meteofrance_seamless,
 * ecmwf_ifs025) at 17:45, its quarters, six hours and four days; the air over two days; the
 * ensemble with five runs over three days. The figures are invented, the shapes are the API's.
 */
export const FIXTURE = {
  latitude: 44.84,
  longitude: -0.5799999,
  elevation: 22,
  timezone: 'Europe/Paris',
  current: {
    time: '2026-10-28T17:45',
    interval: 900,
    temperature_2m: 16.6,
    apparent_temperature: 14.4,
    relative_humidity_2m: 56,
    precipitation: 0,
    weather_code: 0,
    wind_speed_10m: 9.7,
    wind_gusts_10m: 18.7,
    wind_direction_10m: 42,
    is_day: 1
  },
  minutely_15: {
    time: [
      '2026-10-28T17:45',
      '2026-10-28T18:00',
      '2026-10-28T18:15',
      '2026-10-28T18:30',
      '2026-10-28T18:45',
      '2026-10-28T19:00',
      '2026-10-28T19:15',
      '2026-10-28T19:30'
    ],
    precipitation_meteofrance_seamless: [0, 0, 0.1, 0.5, 2.2, 0.3, 0, 0],
    weather_code_meteofrance_seamless: [0, 0, 61, 63, 65, 61, 3, 3],
    // Its hours cut in four: the mapping leaves them out.
    precipitation_ecmwf_ifs025: [0.1, 0.1, 0.1, 0.1, 0.4, 0.4, 0.4, 0.4],
    weather_code_ecmwf_ifs025: [61, 61, 61, 61, 61, 61, 61, 61]
  },
  hourly: {
    time: ['2026-10-28T17:00', '2026-10-28T18:00', '2026-10-28T19:00', '2026-10-28T20:00', '2026-10-28T21:00', '2026-10-28T22:00'],
    temperature_2m_meteofrance_seamless: [16.8, 16.0, 15.1, 14.2, 13.5, null],
    apparent_temperature_meteofrance_seamless: [14.5, 13.9, 13.0, 12.1, 11.6, null],
    relative_humidity_2m_meteofrance_seamless: [55, 60, 72, 85, 88, null],
    precipitation_meteofrance_seamless: [0, 0, 0.4, 3.1, 0.6, null],
    precipitation_probability_meteofrance_seamless: [null, null, null, null, null, null],
    weather_code_meteofrance_seamless: [0, 0, 61, 63, 80, null],
    wind_speed_10m_meteofrance_seamless: [9.7, 10.2, 12.5, 18.4, 16.0, null],
    wind_gusts_10m_meteofrance_seamless: [18.7, 20.1, 28.3, 45.0, 38.2, null],
    wind_direction_10m_meteofrance_seamless: [42, 60, 200, 240, 250, null],
    is_day_meteofrance_seamless: [1, 1, 0, 0, 0, null],
    temperature_2m_ecmwf_ifs025: [15.9, 15.2, 14.6, 13.9, 13.1, 12.6],
    apparent_temperature_ecmwf_ifs025: [13.8, 13.1, 12.4, 11.6, 11.0, 10.4],
    relative_humidity_2m_ecmwf_ifs025: [58, 63, 70, 80, 84, 86],
    precipitation_ecmwf_ifs025: [0, 0, 0.2, 1.5, 0.8, 0.1],
    precipitation_probability_ecmwf_ifs025: [2, 10, 55, 85, 70, 40],
    weather_code_ecmwf_ifs025: [1, 1, 61, 63, 80, 61],
    wind_speed_10m_ecmwf_ifs025: [9.0, 9.5, 11.8, 17.0, 15.2, 13.1],
    wind_gusts_10m_ecmwf_ifs025: [17.0, 19.0, 26.0, 41.0, 36.0, 30.0],
    wind_direction_10m_ecmwf_ifs025: [40, 55, 195, 235, 245, 250],
    is_day_ecmwf_ifs025: [1, 1, 0, 0, 0, 0]
  },
  daily: {
    time: ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'],
    weather_code_meteofrance_seamless: [3, 61, null, null],
    temperature_2m_max_meteofrance_seamless: [17.7, 16.1, null, null],
    temperature_2m_min_meteofrance_seamless: [9.0, 8.1, null, null],
    apparent_temperature_max_meteofrance_seamless: [15.9, 13.2, null, null],
    apparent_temperature_min_meteofrance_seamless: [7.1, 5.8, null, null],
    precipitation_sum_meteofrance_seamless: [4.1, 4.2, null, null],
    precipitation_hours_meteofrance_seamless: [3, 6, null, null],
    precipitation_probability_max_meteofrance_seamless: [null, null, null, null],
    wind_speed_10m_max_meteofrance_seamless: [18.4, 21.3, null, null],
    wind_gusts_10m_max_meteofrance_seamless: [45.0, 52.0, null, null],
    wind_direction_10m_dominant_meteofrance_seamless: [14, 250, null, null],
    sunrise_meteofrance_seamless: ['2026-10-28T07:34', '2026-10-29T07:36', null, null],
    sunset_meteofrance_seamless: ['2026-10-28T17:56', '2026-10-29T17:55', null, null],
    daylight_duration_meteofrance_seamless: [37320, 37140, null, null],
    weather_code_ecmwf_ifs025: [3, 63, 80, null],
    temperature_2m_max_ecmwf_ifs025: [15.6, 14.7, 15.8, null],
    temperature_2m_min_ecmwf_ifs025: [8.4, 7.9, 6.1, null],
    apparent_temperature_max_ecmwf_ifs025: [14.0, 12.5, 13.9, null],
    apparent_temperature_min_ecmwf_ifs025: [6.5, 5.1, 3.8, null],
    precipitation_sum_ecmwf_ifs025: [2.5, 6.0, 2.3, null],
    precipitation_hours_ecmwf_ifs025: [3, 7, 4, null],
    precipitation_probability_max_ecmwf_ifs025: [85, 85, 60, null],
    wind_speed_10m_max_ecmwf_ifs025: [17.0, 18.0, 12.4, null],
    wind_gusts_10m_max_ecmwf_ifs025: [41.0, 40.0, 25.2, null],
    wind_direction_10m_dominant_ecmwf_ifs025: [20, 240, 315, null],
    sunrise_ecmwf_ifs025: ['2026-10-28T07:34', '2026-10-29T07:35', '2026-10-30T07:37', null],
    sunset_ecmwf_ifs025: ['2026-10-28T17:56', '2026-10-29T17:55', '2026-10-30T17:53', null],
    daylight_duration_ecmwf_ifs025: [37320, 37140, 36960, null]
  }
}

/** The 48 hours of two days, and a value for each from its day (0, 1) and hour. */
const HOURS = Array.from({ length: 48 }, (_, i) => `2026-10-${28 + Math.floor(i / 24)}T${String(i % 24).padStart(2, '0')}:00`)
const byHour = (value: (day: number, hour: number) => number | null) => HOURS.map((_, i) => value(Math.floor(i / 24), i % 24))

export const AIR_FIXTURE = {
  latitude: 44.9,
  longitude: -0.6,
  current: { time: '2026-10-28T17:00', interval: 3600, european_aqi: 49, uv_index: 0.3 },
  hourly: {
    time: HOURS,
    european_aqi: byHour((day, hour) => (day === 0 ? (hour === 18 ? 55 : 30) : 25)),
    // A bell around 13 h: 3.25 at most the first day, 2.1 the second.
    uv_index: byHour((day, hour) => (hour >= 8 && hour <= 17 ? Math.max(0, (day === 0 ? 3.25 : 2.1) - Math.abs(13 - hour) * 0.5) : 0)),
    alder_pollen: byHour(() => 0),
    birch_pollen: byHour(() => 0),
    grass_pollen: byHour((day, hour) => (day === 0 && hour === 14 ? 12.4 : day === 1 ? 0.4 : 0)),
    mugwort_pollen: byHour(() => 0),
    olive_pollen: byHour(() => 0),
    // Out of the European model's reach: nothing.
    ragweed_pollen: byHour(() => null)
  }
}

export const ENSEMBLE_FIXTURE = {
  latitude: 44.75,
  longitude: -0.5,
  daily: {
    time: ['2026-10-28', '2026-10-29', '2026-10-30'],
    temperature_2m_max: [17, 16, 15],
    temperature_2m_max_member01: [17.5, 15, 12],
    temperature_2m_max_member02: [16.5, 17, 19],
    temperature_2m_max_member03: [17, 16.5, 21],
    temperature_2m_max_member04: [18, 14, 10],
    temperature_2m_min: [9, 8, 6],
    temperature_2m_min_member01: [9, 7, 4],
    temperature_2m_min_member02: [8.5, 8, 8],
    temperature_2m_min_member03: [9.5, 9, 9],
    temperature_2m_min_member04: [9, 7.5, 3],
    precipitation_sum: [0, 4, 2],
    precipitation_sum_member01: [0, 5, 0],
    precipitation_sum_member02: [0.2, 0, 1.5],
    precipitation_sum_member03: [0, 3, 0],
    // The ensemble's sums can dip under zero by a hair.
    precipitation_sum_member04: [0, 6, -0.2]
  }
}

/** Each host's answer, as Open-Meteo would give it. */
export const answer = (url: URL) =>
  url.hostname === 'air-quality-api.open-meteo.com' ? AIR_FIXTURE : url.hostname === 'ensemble-api.open-meteo.com' ? ENSEMBLE_FIXTURE : FIXTURE

export const BORDEAUX: Commune = {
  code: '33063',
  name: 'Bordeaux',
  postalCodes: ['33000', '33100', '33200', '33300', '33800'],
  department: '33',
  departmentName: 'Gironde',
  region: 'Nouvelle-Aquitaine',
  population: 267991,
  longitude: -0.5848,
  latitude: 44.8624
}

export const BORDEAUX_SAINT_CLAIR: Commune = {
  code: '76117',
  name: 'Bordeaux-Saint-Clair',
  postalCodes: ['76790'],
  department: '76',
  departmentName: 'Seine-Maritime',
  region: 'Normandie',
  population: 658,
  longitude: 0.2445,
  latitude: 49.6953
}

/** An overseas commune: AROME's 15-minute run doesn't reach it. */
export const FORT_DE_FRANCE: Commune = {
  code: '97209',
  name: 'Fort-de-France',
  postalCodes: ['97200'],
  department: '972',
  departmentName: 'Martinique',
  region: 'Martinique',
  population: 76000,
  longitude: -61.07,
  latitude: 14.6
}
