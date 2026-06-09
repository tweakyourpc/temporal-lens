const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LOOKUP = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export const WEEKDAY_LOOKUP = WEEKDAY_NAMES.reduce((lookup, name, index) => {
  lookup[name.toLowerCase()] = index;
  return lookup;
}, {});

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function resolveAnchor(anchor, postedAt) {
  const reference = parseDate(postedAt);

  if (!reference || !anchor) {
    return null;
  }

  if (anchor === "same_day") {
    return reference;
  }

  if (anchor === "next_day") {
    return addDays(reference, 1);
  }

  if (anchor === "prev_day") {
    return addDays(reference, -1);
  }

  if (anchor === "this_weekend") {
    return withTime(nextOrSameWeekday(reference, 6), 10, 0);
  }

  if (anchor === "end_of_day") {
    return withTime(reference, 17, 0);
  }

  if (anchor === "end_of_week") {
    return withTime(nextOrSameWeekday(reference, 5), 17, 0);
  }

  if (anchor === "start_of_next_week") {
    return withTime(nextWeekday(reference, 1), 9, 0);
  }

  if (anchor.startsWith("same_day_part:")) {
    return resolveDayPart(reference, anchor.split(":")[1]);
  }

  if (anchor.startsWith("next_weekday:")) {
    const weekday = Number(anchor.split(":")[1]);
    return Number.isInteger(weekday) ? nextWeekday(reference, weekday) : null;
  }

  if (anchor.startsWith("this_weekday:")) {
    const weekday = Number(anchor.split(":")[1]);
    return Number.isInteger(weekday) ? nextOrSameWeekday(reference, weekday) : null;
  }

  if (anchor.startsWith("prev_weekday:")) {
    const weekday = Number(anchor.split(":")[1]);
    return Number.isInteger(weekday) ? previousWeekday(reference, weekday) : null;
  }

  const inDaysMatch = anchor.match(/^in_(\d+)_days$/);

  if (inDaysMatch) {
    return addDays(reference, Number(inDaysMatch[1]));
  }

  const inWeeksMatch = anchor.match(/^in_(\d+)_weeks$/);

  if (inWeeksMatch) {
    return addDays(reference, Number(inWeeksMatch[1]) * 7);
  }

  const inMonthsMatch = anchor.match(/^in_(\d+)_months$/);

  if (inMonthsMatch) {
    return addMonths(reference, Number(inMonthsMatch[1]));
  }

  const inHoursMatch = anchor.match(/^in_(\d+)_hours$/);

  if (inHoursMatch) {
    return addHours(reference, Number(inHoursMatch[1]));
  }

  const daysAgoMatch = anchor.match(/^(\d+)_days_ago$/);

  if (daysAgoMatch) {
    return addDays(reference, -Number(daysAgoMatch[1]));
  }

  const weeksAgoMatch = anchor.match(/^(\d+)_weeks_ago$/);

  if (weeksAgoMatch) {
    return addDays(reference, -Number(weeksAgoMatch[1]) * 7);
  }

  const monthsAgoMatch = anchor.match(/^(\d+)_months_ago$/);

  if (monthsAgoMatch) {
    return addMonths(reference, -Number(monthsAgoMatch[1]));
  }

  const specificDateMatch = anchor.match(/^specific_date:(\d{4})-(\d{2})-(\d{2})$/);

  if (specificDateMatch) {
    const target = new Date(
      Number(specificDateMatch[1]),
      Number(specificDateMatch[2]) - 1,
      Number(specificDateMatch[3]),
      reference.getHours(),
      reference.getMinutes(),
      0,
      0,
    );
    return Number.isNaN(target.getTime()) ? null : target;
  }

  return null;
}

export function formatRelativeTarget(targetIso, now = new Date()) {
  const target = parseDate(targetIso);

  if (!target) {
    return "unknown";
  }

  const diffMs = target.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (absMs < minute) {
    return "now";
  }

  if (absMs < hour) {
    return relativeFormatter.format(Math.round(diffMs / minute), "minute");
  }

  if (absMs < day) {
    return relativeFormatter.format(Math.round(diffMs / hour), "hour");
  }

  if (absMs < week) {
    return relativeFormatter.format(Math.round(diffMs / day), "day");
  }

  if (absMs < month) {
    return relativeFormatter.format(Math.round(diffMs / week), "week");
  }

  if (absMs < year) {
    return relativeFormatter.format(Math.round(diffMs / month), "month");
  }

  return relativeFormatter.format(Math.round(diffMs / year), "year");
}

export function buildSpecificDateAnchor(monthToken, dayToken, yearToken, postedAt) {
  const month = MONTH_LOOKUP[String(monthToken).toLowerCase()];
  const day = Number(dayToken);
  const reference = parseDate(postedAt);

  if (!Number.isInteger(month) || !Number.isInteger(day) || !reference) {
    return null;
  }

  const year = yearToken ? normalizeYear(Number(yearToken)) : inferYear(reference, month, day);
  return buildValidatedDateAnchor(year, month, day);
}

export function buildNumericDateAnchor(monthToken, dayToken, yearToken, postedAt) {
  const month = Number(monthToken) - 1;
  const day = Number(dayToken);
  const reference = parseDate(postedAt);

  if (!Number.isInteger(month) || !Number.isInteger(day) || !reference) {
    return null;
  }

  const year = yearToken ? normalizeYear(Number(yearToken)) : inferYear(reference, month, day);
  return buildValidatedDateAnchor(year, month, day);
}

export function buildIsoDateAnchor(yearToken, monthToken, dayToken) {
  return buildValidatedDateAnchor(Number(yearToken), Number(monthToken) - 1, Number(dayToken));
}

export function buildAnnotationTooltip(postedAt, targetIso, anchor) {
  const postedDate = parseDate(postedAt);
  const targetDate = parseDate(targetIso);

  if (!postedDate || !targetDate) {
    return "Temporal Lens";
  }

  return `Posted ${dateTimeFormatter.format(postedDate)} -> ${describeAnchor(anchor)} -> ${dateTimeFormatter.format(targetDate)}`;
}

function describeAnchor(anchor) {
  if (!anchor) {
    return "resolved date";
  }

  if (anchor === "same_day") {
    return "same day";
  }

  if (anchor === "next_day") {
    return "next day";
  }

  if (anchor === "prev_day") {
    return "previous day";
  }

  if (anchor === "this_weekend") {
    return "this weekend";
  }

  if (anchor === "end_of_day") {
    return "end of day";
  }

  if (anchor === "end_of_week") {
    return "end of week";
  }

  if (anchor === "start_of_next_week") {
    return "start of next week";
  }

  if (anchor.startsWith("same_day_part:")) {
    return anchor.split(":")[1].replaceAll("_", " ");
  }

  if (anchor.startsWith("next_weekday:")) {
    return `next ${WEEKDAY_NAMES[Number(anchor.split(":")[1])]}`;
  }

  if (anchor.startsWith("this_weekday:")) {
    return `this ${WEEKDAY_NAMES[Number(anchor.split(":")[1])]}`;
  }

  if (anchor.startsWith("prev_weekday:")) {
    return `previous ${WEEKDAY_NAMES[Number(anchor.split(":")[1])]}`;
  }

  if (anchor.startsWith("specific_date:")) {
    return anchor.replace("specific_date:", "");
  }

  return anchor.replaceAll("_", " ");
}

function buildValidatedDateAnchor(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const candidate = new Date(year, month, day, 12, 0, 0, 0);

  if (
    Number.isNaN(candidate.getTime()) ||
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  return `specific_date:${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(candidate.getDate()).padStart(2, "0")}`;
}

function normalizeYear(year) {
  if (!Number.isInteger(year)) {
    return null;
  }

  if (year >= 100) {
    return year;
  }

  return year >= 70 ? 1900 + year : 2000 + year;
}

function resolveDayPart(reference, part) {
  if (part === "morning") {
    return withTime(reference, 9, 0);
  }

  if (part === "afternoon") {
    return withTime(reference, 15, 0);
  }

  if (part === "evening") {
    return withTime(reference, 20, 0);
  }

  if (part === "night") {
    return withTime(reference, 22, 0);
  }

  return null;
}

function parseDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, amount) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + amount);
  return next;
}

function addHours(date, amount) {
  return new Date(date.getTime() + amount * 60 * 60 * 1000);
}

function addMonths(date, amount) {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + amount);
  return next;
}

function withTime(date, hours, minutes) {
  const next = new Date(date.getTime());
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function nextWeekday(reference, targetDay) {
  let candidate = new Date(reference.getTime());

  do {
    candidate = addDays(candidate, 1);
  } while (candidate.getDay() !== targetDay);

  return candidate;
}

function nextOrSameWeekday(reference, targetDay) {
  let candidate = new Date(reference.getTime());

  while (candidate.getDay() !== targetDay) {
    candidate = addDays(candidate, 1);
  }

  return candidate;
}

function previousWeekday(reference, targetDay) {
  let candidate = new Date(reference.getTime());

  do {
    candidate = addDays(candidate, -1);
  } while (candidate.getDay() !== targetDay);

  return candidate;
}

function inferYear(reference, month, day) {
  const currentYear = reference.getFullYear();
  const currentMonth = reference.getMonth();
  const currentDay = reference.getDate();

  if (month < currentMonth || (month === currentMonth && day < currentDay - 14)) {
    return currentYear + 1;
  }

  if (month > currentMonth || (month === currentMonth && day > currentDay + 14)) {
    return currentYear - 1;
  }

  return currentYear;
}
