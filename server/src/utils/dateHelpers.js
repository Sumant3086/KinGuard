/**
 * Date utilities for handling Kinshasa (DRC Congo) timezone (CAT, UTC+2)
 * All business logic should use these functions to ensure consistent timezone handling
 */

/**
 * Get current date in Kinshasa timezone as a Date object at midnight (00:00:00)
 * @returns {Date} Today's date in Kinshasa timezone, normalized to midnight
 */
export function getTodayInKinshasa() {
  // Get current time in Kinshasa timezone
  const nowStr = new Date().toLocaleString('en-US', { timeZone: 'Africa/Kinshasa' });
  const nowInKinshasa = new Date(nowStr);
  
  // Normalize to midnight (00:00:00)
  nowInKinshasa.setHours(0, 0, 0, 0);
  return nowInKinshasa;
}

/**
 * Get current time in Kinshasa timezone
 * @returns {Date} Current date and time in Kinshasa timezone
 */
export function getNowInKinshasa() {
  const nowStr = new Date().toLocaleString('en-US', { timeZone: 'Africa/Kinshasa' });
  return new Date(nowStr);
}

/**
 * Check if a date (ignoring time) matches today in Kinshasa timezone
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is today in Kinshasa timezone
 */
export function isTodayInKinshasa(date) {
  const today = getTodayInKinshasa();
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  return checkDate.getTime() === today.getTime();
}

/**
 * Check if a date is yesterday in Kinshasa timezone
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date was yesterday in Kinshasa timezone
 */
export function isYesterdayInKinshasa(date) {
  const today = getTodayInKinshasa();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  return checkDate.getTime() === yesterday.getTime();
}

/**
 * Check if a deadline has passed in Kinshasa timezone
 * @param {Date|string} deadline - Deadline to check
 * @returns {boolean} True if deadline has passed
 */
export function isDeadlinePassed(deadline) {
  if (!deadline) return false;
  const now = getNowInKinshasa();
  const deadlineDate = new Date(deadline);
  return now > deadlineDate;
}

/**
 * Format date for logging/display in Kinshasa timezone
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatKinshasaDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Kinshasa'
  });
}
