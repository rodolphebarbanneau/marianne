import type { Commune } from '@marianne/sdk/main'

/** An Open-Meteo answer for Bordeaux with two models (meteofrance_seamless, ecmwf_ifs025), shortened to three days and five hours. */
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
  daily: {
    time: ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'],
    weather_code_meteofrance_seamless: [3, 61, null, null],
    temperature_2m_max_meteofrance_seamless: [17.7, 16.1, null, null],
    temperature_2m_min_meteofrance_seamless: [9.0, 8.1, null, null],
    precipitation_sum_meteofrance_seamless: [0, 4.2, null, null],
    precipitation_probability_max_meteofrance_seamless: [null, null, null, null],
    wind_speed_10m_max_meteofrance_seamless: [10.5, 21.3, null, null],
    wind_gusts_10m_max_meteofrance_seamless: [20.9, 45.0, null, null],
    wind_direction_10m_dominant_meteofrance_seamless: [14, 250, null, null],
    sunrise_meteofrance_seamless: ['2026-10-28T07:34', '2026-10-29T07:36', null, null],
    sunset_meteofrance_seamless: ['2026-10-28T17:56', '2026-10-29T17:55', null, null],
    weather_code_ecmwf_ifs025: [3, 63, 80, null],
    temperature_2m_max_ecmwf_ifs025: [15.6, 14.7, 15.8, null],
    temperature_2m_min_ecmwf_ifs025: [8.4, 7.9, 6.1, null],
    precipitation_sum_ecmwf_ifs025: [0.1, 6.0, 2.3, null],
    precipitation_probability_max_ecmwf_ifs025: [2, 85, 60, null],
    wind_speed_10m_max_ecmwf_ifs025: [9.0, 18.0, 12.4, null],
    wind_gusts_10m_max_ecmwf_ifs025: [19.0, 40.0, 25.2, null],
    wind_direction_10m_dominant_ecmwf_ifs025: [20, 240, 315, null],
    sunrise_ecmwf_ifs025: ['2026-10-28T07:34', '2026-10-29T07:35', '2026-10-30T07:37', null],
    sunset_ecmwf_ifs025: ['2026-10-28T17:56', '2026-10-29T17:55', '2026-10-30T17:53', null]
  },
  hourly: {
    time: ['2026-10-28T17:00', '2026-10-28T18:00', '2026-10-28T19:00', '2026-10-28T20:00', '2026-10-28T21:00'],
    weather_code_meteofrance_seamless: [0, 0, 3, 80, null],
    weather_code_ecmwf_ifs025: [1, 1, 3, 80, 61]
  }
}

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
