/**
 * Sözlükteki `{token}` yer tutucularını doldurur.
 *
 * Sözlük değerleri fonksiyon değil düz metin olmak zorunda: sunucuda çözülüp
 * istemci bileşenlerine prop olarak geçiyor ve React fonksiyonları bu sınırdan
 * geçirmiyor. Düz metin ayrıca çeviri dosyalarını çevirmen için okunaklı tutar.
 */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
