// Calendar dates in this product are the field crew's local dates: the day a
// log was written, a test taken, a shift worked.
//
// new Date().toISOString().slice(0, 10) returns the UTC date, which in the US
// is already tomorrow from late afternoon or evening onward, so an evening
// shift's paperwork was dated the next day. These helpers read the local
// calendar instead.

const pad = (value) => String(value).padStart(2, "0");

// Today (or any Date) as YYYY-MM-DD in the viewer's own timezone.
export function localDateString(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

// A stored timestamp as its local calendar date. Date-only strings are
// returned untouched: they carry no time to convert, and parsing them would
// move them a day.
export function toLocalDateString(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return localDateString(new Date(text));
}
