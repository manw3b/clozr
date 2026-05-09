/**
 * Parser de vCard (.vcf) — el formato estándar para contactos.
 *
 * Soporta vCard 2.1, 3.0 y 4.0 — los tres conviven en exports de
 * iPhone, Android, Gmail, Outlook. Devuelve una lista de contactos
 * con los campos que nos interesan: nombre, teléfono(s), email(s),
 * notas.
 *
 * No es un parser RFC-completo — pero cubre el 99% de los archivos
 * reales. Maneja:
 *   - BEGIN:VCARD / END:VCARD blocks
 *   - line continuation (línea siguiente empieza con espacio o tab)
 *   - escape sequences (\n \, \;)
 *   - quoted-printable encoding (`ENCODING=QUOTED-PRINTABLE`)
 *   - parámetros con TYPE=CELL/HOME/WORK
 *   - propiedades grouped (item1.TEL:...)
 */

export interface VCardContact {
  name: string;
  phones: string[];
  emails: string[];
  notes?: string;
}

export function parseVCard(text: string): VCardContact[] {
  // Normalizar line endings y unfold continuation lines
  // (regla CRLF + WS → es continuación de la línea anterior)
  const unfolded = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "");

  const contacts: VCardContact[] = [];
  let current: VCardContact | null = null;

  for (const rawLine of unfolded.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.toUpperCase() === "BEGIN:VCARD") {
      current = { name: "", phones: [], emails: [] };
      continue;
    }
    if (line.toUpperCase() === "END:VCARD") {
      if (current && (current.name || current.phones.length > 0 || current.emails.length > 0)) {
        contacts.push(current);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    // Separar nombre de propiedad (con sus parámetros) del valor.
    // Ej: TEL;TYPE=CELL:+5421156789012
    //     N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Smith=20Jr
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const propPart = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);

    // Quitar prefijo "groupX." de propiedades agrupadas (ej: item1.TEL:)
    const dotIdx = propPart.indexOf(".");
    const propClean = dotIdx >= 0 ? propPart.slice(dotIdx + 1) : propPart;

    // Separar nombre de propiedad y parámetros: "TEL;TYPE=CELL"
    const semiIdx = propClean.indexOf(";");
    const propName = (semiIdx >= 0 ? propClean.slice(0, semiIdx) : propClean).toUpperCase();
    const params = semiIdx >= 0 ? propClean.slice(semiIdx + 1).toUpperCase() : "";

    const decoded = decodeValue(value, params);

    switch (propName) {
      case "FN":
        // Full name (preferido)
        if (!current.name) current.name = decoded;
        break;
      case "N":
        // Structured name: Apellido;Nombre;Medio;Prefijo;Sufijo
        // Sólo lo usamos si no tenemos FN (algunos exports viejos no
        // ponen FN, sólo N).
        if (!current.name) {
          const parts = decoded.split(";").map((p) => p.trim()).filter(Boolean);
          // Reordenamos: Nombre Medio Apellido (parts[1] parts[2] parts[0])
          if (parts.length >= 2) {
            current.name = [parts[1], parts[2], parts[0]].filter(Boolean).join(" ");
          } else {
            current.name = parts.join(" ");
          }
        }
        break;
      case "TEL":
        if (decoded.trim()) current.phones.push(cleanPhone(decoded));
        break;
      case "EMAIL":
        if (decoded.trim()) current.emails.push(decoded.trim());
        break;
      case "NOTE":
        current.notes = (current.notes ? `${current.notes}\n` : "") + decoded;
        break;
      default:
        // Ignoramos ADR, ORG, BDAY, PHOTO, etc. — fuera de scope para
        // el modelo de cliente.
        break;
    }
  }

  return contacts;
}

/** Decoder de un valor según los parámetros (encoding, charset). */
function decodeValue(value: string, params: string): string {
  let v = value;
  // Quoted-printable (vCard 2.1 vieja, todavía aparece en exports de
  // Outlook y Android antiguos).
  if (params.includes("QUOTED-PRINTABLE")) {
    v = decodeQuotedPrintable(v);
  }
  // Escape sequences estándar de vCard 3.0+
  v = v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
  return v.trim();
}

function decodeQuotedPrintable(s: string): string {
  // =XX → byte. Manejamos UTF-8 multibyte: capturamos secuencias =XX
  // consecutivas y las decodificamos como bytes.
  const bytes: number[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "=" && i + 2 < s.length) {
      const hex = s.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 3;
        continue;
      }
    }
    // Char ASCII normal
    bytes.push(s.charCodeAt(i));
    i++;
  }
  try {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  } catch {
    return s;
  }
}

function cleanPhone(s: string): string {
  // Mantener +, dígitos y espacios (algunos clientes guardan formato
  // con paréntesis, que igual se normaliza después en customersDb).
  return s.trim();
}
