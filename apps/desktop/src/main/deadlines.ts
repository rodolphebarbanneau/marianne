import { serviceDeadlines, type Deadline } from '@marianne/profile'
import { services } from './host'
import { profile } from './profile/store'

/**
 * Every deadline of the user: those of their profile (rules, the official calendar, their own)
 * and those the services that are on know of (a toll to pay). The deadlines tool, the window and
 * the reminders all read this list.
 */
export function deadlines(now = new Date(), days = 400): Deadline[] {
  return [...profile.deadlines(now, days), ...serviceDeadlines(services.deadlines(), now, days)].sort((a, b) => a.date.localeCompare(b.date))
}
