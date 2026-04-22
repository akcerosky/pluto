import { addDays, eachDayOfInterval, format as formatDate } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { IST_TIME_ZONE } from '../config/plans.js';
export const getIstNow = () => new Date();
export const getIstDayKey = (date) => `${formatInTimeZone(date, IST_TIME_ZONE, 'yyyy-MM-dd')}-IST`;
export const getLast30IstDayKeys = (today = new Date()) => {
    const end = toZonedTime(today, IST_TIME_ZONE);
    const start = addDays(end, -29);
    return eachDayOfInterval({ start, end }).map((date) => getIstDayKey(date));
};
export const getIstDateRangeInclusive = (start, end) => {
    const zonedStart = toZonedTime(start, IST_TIME_ZONE);
    const zonedEnd = toZonedTime(end, IST_TIME_ZONE);
    return eachDayOfInterval({ start: zonedStart, end: zonedEnd }).map((date) => getIstDayKey(date));
};
export const addDaysInIst = (date, days) => addDays(toZonedTime(date, IST_TIME_ZONE), days);
export const toIstIsoString = (date) => formatInTimeZone(date, IST_TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
export const parseIstDayKeyToDate = (dayKey) => {
    const iso = dayKey.replace(/-IST$/, '');
    return toZonedTime(new Date(`${iso}T00:00:00+05:30`), IST_TIME_ZONE);
};
export const countIstCalendarDaysInclusive = (start, end) => {
    return getIstDateRangeInclusive(start, end).length;
};
export const formatDateForDisplay = (date) => formatDate(date, 'yyyy-MM-dd');
