import { useEffect, useState } from "react";

const PREFIX = "clozr:state:";

/**
 * useState que persiste el valor en localStorage.
 *
 * Útil para filtros, ordenamientos, preferencias de UI que el usuario
 * espera que se mantengan entre sesiones (ej: "Filtro Activos en Clientes").
 *
 * Ejemplo:
 *   const [tab, setTab] = usePersistedState("clientes.typeFilter", "todos");
 */
export function usePersistedState<T>(key: string, initial: T): [T, (v: T) => void] {
  const fullKey = PREFIX + key;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(fullKey, JSON.stringify(value));
    } catch {
      // Storage full / disabled — silently ignore.
    }
  }, [fullKey, value]);

  return [value, setValue];
}
