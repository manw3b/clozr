-- Auth local por PIN. El PIN es 4-6 dígitos, hasheado con SHA-256 + salt
-- propio del user (id). No es seguridad criptográfica fuerte (es desktop
-- single-device, no protege contra acceso a la DB), pero sí es una barrera
-- UX para que el vendedor no pueda abrir la sesión del owner cuando éste
-- presta la máquina.
--
-- pin_hash NULL = el usuario no tiene PIN seteado, login es directo.
ALTER TABLE users ADD COLUMN pin_hash TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
