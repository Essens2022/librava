// Product types: every title is an "ebook" unless the product_type column says otherwise.
// Digital products (planners, calendars, organizers, spreadsheets, templates) are files that are downloaded and used, not read in the reader.
import { t } from './i18n.js?v=20261113121834';

export const PTYPES = ['planner', 'calendar', 'organizer', 'spreadsheet', 'template'];
export const ptypeOf = b => (b && PTYPES.includes(b.product_type)) ? b.product_type : 'ebook';
export const isDigital = b => ptypeOf(b) !== 'ebook';
// formats a digital product file can have (ebooks stay pdf / epub)
export const FILE_FORMATS = ['pdf', 'epub', 'xlsx', 'docx', 'zip'];
export const FORMAT_MIME = {
  pdf: 'application/pdf', epub: 'application/epub+zip', zip: 'application/zip',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
// what the buyer sees on cards and pages: "Digital book (PDF)" for an ebook, "Planner · XLSX" for a digital product
export const kindLabel = b => isDigital(b) ? `${t('ptype1.' + ptypeOf(b))} · ${t('book.formatShort.' + b.format)}` : t('book.format.' + b.format);
// the catalogue has digital products at all? (used to show the menu entry only when there is something to show)
export const hasDigital = list => (list || []).some(b => isDigital(b) && (!b.status || b.status === 'published') && !b.deleted_at);
