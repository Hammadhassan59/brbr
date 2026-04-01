export interface WhatsAppTemplate {
  id: string;
  name: string;
  nameEn: string;
  bodyEn: string;
  bodyUr: string;
  variables: string[];
}

export const DEFAULT_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'appointment_confirmation',
    name: 'Appointment Confirmation',
    nameEn: 'Appointment Confirmation',
    bodyEn: `Hi {client_name}! ✨
Your appointment is confirmed.
📅 {date}
⏰ {time}
💇 {services}
👩 Stylist: {stylist_name}
📍 {branch_address}
Thank you! — BrBr | {salon_name}`,
    bodyUr: `السلام علیکم {client_name}! ✨
آپ کی اپائنٹمنٹ کنفرم ہو گئی۔
📅 {date}
⏰ {time}
💇 {services}
👩 اسٹائلسٹ: {stylist_name}
📍 {branch_address}
شکریہ! — BrBr | {salon_name}`,
    variables: ['client_name', 'date', 'time', 'services', 'stylist_name', 'branch_address', 'salon_name'],
  },
  {
    id: 'appointment_reminder',
    name: 'Appointment Reminder',
    nameEn: 'Appointment Reminder',
    bodyEn: `⏰ Reminder, {client_name}!
Your appointment is in 1 hour.
{time} — {stylist_name}
We are waiting for you! 😊
— {salon_name}`,
    bodyUr: `⏰ یاد دہانی، {client_name}!
آپ کی اپائنٹمنٹ 1 گھنٹے میں ہے۔
{time} — {stylist_name}
ہم آپ کا انتظار کر رہے ہیں! 😊
— {salon_name}`,
    variables: ['client_name', 'time', 'stylist_name', 'salon_name'],
  },
  {
    id: 'payment_receipt',
    name: 'Payment Receipt',
    nameEn: 'Payment Receipt',
    bodyEn: `Thank you {client_name}! 🙏
*{salon_name}*
Bill # {bill_number} | {date}
─────────────
{bill_items}
─────────────
*Total: Rs {bill_total}*
Paid: {payment_method}
⭐ Points earned: {loyalty_points}
Please visit again!
Book: {booking_link}`,
    bodyUr: `شکریہ {client_name}! 🙏
*{salon_name}*
بل # {bill_number} | {date}
─────────────
{bill_items}
─────────────
*ٹوٹل: Rs {bill_total}*
ادائیگی: {payment_method}
⭐ پوائنٹس: {loyalty_points}
دوبارہ تشریف لائیں!`,
    variables: ['client_name', 'salon_name', 'bill_number', 'date', 'bill_items', 'bill_total', 'payment_method', 'loyalty_points', 'booking_link'],
  },
  {
    id: 'udhaar_reminder',
    name: 'Udhaar Reminder',
    nameEn: 'Udhaar Reminder',
    bodyEn: `Dear {client_name},
Your outstanding balance at {salon_name}:
*Rs {udhaar_amount}*
Please clear it on your next visit.
Thank you! 🙏`,
    bodyUr: `محترم {client_name}،
{salon_name} میں آپ کا بقایا:
*Rs {udhaar_amount}*
اگلے وزٹ میں کلیئر کر دیجیے۔
شکریہ! 🙏`,
    variables: ['client_name', 'salon_name', 'udhaar_amount'],
  },
  {
    id: 'birthday_wish',
    name: 'Birthday Wish',
    nameEn: 'Birthday Wish',
    bodyEn: `🎂 Happy Birthday {client_name}!
{salon_name} wishes you the best!
Visit this month and get:
*15% OFF* on your next visit!
Book: {booking_link}
— BrBr Team 💕`,
    bodyUr: `🎂 سالگرہ مبارک {client_name}!
{salon_name} کی طرف سے دلی مبارکباد!
اس مہینے آئیں اور پائیں:
*15% OFF* اگلے وزٹ پر!
— BrBr ٹیم 💕`,
    variables: ['client_name', 'salon_name', 'booking_link'],
  },
  {
    id: 'winback',
    name: 'Win-Back Message',
    nameEn: 'Win-Back (30 days no visit)',
    bodyEn: `We miss you, {client_name}! 💕
It has been a while since your last visit to {salon_name}.
Come back and get *10% OFF*!
Book: {booking_link}
— {salon_name}`,
    bodyUr: `ہم آپ کو مس کر رہے ہیں، {client_name}! 💕
{salon_name} میں کچھ عرصہ ہو گیا۔
واپس آئیں اور پائیں *10% OFF*!
— {salon_name}`,
    variables: ['client_name', 'salon_name', 'booking_link'],
  },
  {
    id: 'low_stock_alert',
    name: 'Low Stock Alert',
    nameEn: 'Low Stock Alert (to owner)',
    bodyEn: `⚠️ *BrBr Stock Alert*
{salon_name} — {branch_name}
Low stock items:
{product_list}
Order soon!`,
    bodyUr: `⚠️ *BrBr اسٹاک الرٹ*
{salon_name} — {branch_name}
کم اسٹاک:
{product_list}
جلدی آرڈر کریں!`,
    variables: ['salon_name', 'branch_name', 'product_list'],
  },
  {
    id: 'daily_summary',
    name: 'Daily Summary',
    nameEn: 'Daily Summary (to owner)',
    bodyEn: `📊 *Daily Summary — {date}*
{salon_name} | {branch_name}
─────────────
Revenue: Rs {total_revenue}
Appointments: {completed}/{total}
Cash: Rs {cash}
JazzCash: Rs {jazzcash}
Udhaar added: Rs {udhaar}
─────────────
Top service: {top_service}
Top stylist: {top_stylist}`,
    bodyUr: `📊 *روزانہ خلاصہ — {date}*
{salon_name} | {branch_name}
─────────────
آمدنی: Rs {total_revenue}
اپائنٹمنٹس: {completed}/{total}
کیش: Rs {cash}
جیز کیش: Rs {jazzcash}
ادھار: Rs {udhaar}
─────────────
ٹاپ سروس: {top_service}
ٹاپ اسٹائلسٹ: {top_stylist}`,
    variables: ['date', 'salon_name', 'branch_name', 'total_revenue', 'completed', 'total', 'cash', 'jazzcash', 'udhaar', 'top_service', 'top_stylist'],
  },
];
