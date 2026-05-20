import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, ModalField } from '../../../components/Modal';
import { Button } from '../../../components/Button';
import { Input, Select } from '../../../components/Input';
import { customersDb } from '../../../lib/db/customers';
import { invalidate } from '../../../lib/queryKeys';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { useUIStore } from '../../../store/uiStore';
import {
  InstagramIcon,
  FacebookIcon,
  TikTokIcon,
  XIcon,
} from '../../../components/icons/SocialIcons';
import type { Client, ClientType } from '../../../types/domain';

const TYPE_LABELS: Record<ClientType, string> = {
  final: 'Final',
  revendedor: 'Revendedor',
  mayorista: 'Mayorista',
  empresa: 'Empresa',
};

interface ClientFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Si se pasa un cliente, es modo edición */
  client?: Client | null;
}

export function ClientFormModal({ open, onClose, client }: ClientFormModalProps) {
  const { activeWorkspace } = useWorkspaceStore();
  const { showToast } = useUIStore();
  const qc = useQueryClient();
  const editing = !!client;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [type, setType] = useState<ClientType>('final');
  const [notes, setNotes] = useState('');
  // Redes sociales — opcionales. Aceptamos handle (sin @) o URL completa,
  // la UI del drawer maneja ambos casos al renderizar el link.
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [twitter, setTwitter] = useState('');
  const [socialsOpen, setSocialsOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setName(client?.name ?? '');
      setPhone(client?.phone ?? '');
      setEmail(client?.email ?? '');
      setType(client?.type ?? 'final');
      setNotes(client?.notes ?? '');
      setInstagram(client?.instagram ?? '');
      setFacebook(client?.facebook ?? '');
      setTiktok(client?.tiktok ?? '');
      setTwitter(client?.twitter ?? '');
      // Si el cliente YA tiene alguna red cargada, abrimos la sección de
      // entrada para que se vea cargada y editable.
      const hasAnySocial =
        !!(client?.instagram || client?.facebook || client?.tiktok || client?.twitter);
      setSocialsOpen(hasAnySocial);
    }
  }, [open, client]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspace) throw new Error('Sin workspace activo');
      const payload = {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        type,
        notes: notes.trim() || null,
        instagram: instagram.trim() || null,
        facebook: facebook.trim() || null,
        tiktok: tiktok.trim() || null,
        twitter: twitter.trim() || null,
      };
      if (editing && client) {
        await customersDb.update(activeWorkspace.id, client.id, payload);
      } else {
        await customersDb.create(activeWorkspace.id, payload);
      }
    },
    onSuccess: () => {
      invalidate.afterClientChange(qc);
      showToast(editing ? 'Cliente actualizado' : 'Cliente creado', 'success');
      onClose();
    },
  });

  const canSubmit = name.trim().length >= 2;

  const isDirty = () => {
    if (!client) {
      return (
        name.trim().length > 0 ||
        phone.trim().length > 0 ||
        email.trim().length > 0 ||
        notes.trim().length > 0 ||
        instagram.trim().length > 0 ||
        facebook.trim().length > 0 ||
        tiktok.trim().length > 0 ||
        twitter.trim().length > 0 ||
        type !== "final"
      );
    }
    return (
      name !== (client.name ?? "") ||
      phone !== (client.phone ?? "") ||
      email !== (client.email ?? "") ||
      type !== (client.type ?? "final") ||
      notes !== (client.notes ?? "") ||
      instagram !== (client.instagram ?? "") ||
      facebook !== (client.facebook ?? "") ||
      tiktok !== (client.tiktok ?? "") ||
      twitter !== (client.twitter ?? "")
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      isDirty={isDirty}
      confirmCloseText="¿Cerrar y descartar los cambios?"
      title={editing ? 'Editar cliente' : 'Nuevo cliente'}
      maxWidth={520}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            loading={mutation.isPending}
          >
            {editing ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </>
      }
    >
      <ModalField label="Nombre" required>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Carlos Pérez"
          autoFocus
        />
      </ModalField>

      <ModalField label="Teléfono">
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+54 9 11 ..."
        />
      </ModalField>

      <ModalField label="Email">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="cliente@email.com"
        />
      </ModalField>

      <ModalField label="Tipo" required>
        <Select value={type} onChange={(e) => setType(e.target.value as ClientType)}>
          {(Object.keys(TYPE_LABELS) as ClientType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </ModalField>

      {/* Redes sociales — sección plegable para no ensuciar el form a los
          usuarios que no las cargan. Si el cliente YA tenía alguna red
          guardada, se abre por default (lógica en useEffect arriba). */}
      <div style={{ marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setSocialsOpen((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            padding: '8px 0',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <span>{socialsOpen ? '▾' : '▸'}</span>
          Redes sociales (opcional)
        </button>
        {socialsOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            <SocialInput
              icon={<InstagramIcon size={14} color="#E1306C" />}
              label="Instagram"
              placeholder="@usuario o URL"
              value={instagram}
              onChange={setInstagram}
            />
            <SocialInput
              icon={<FacebookIcon size={14} color="#1877F2" />}
              label="Facebook"
              placeholder="usuario o URL completa"
              value={facebook}
              onChange={setFacebook}
            />
            <SocialInput
              icon={<TikTokIcon size={13} color="var(--text)" />}
              label="TikTok"
              placeholder="@usuario o URL"
              value={tiktok}
              onChange={setTiktok}
            />
            <SocialInput
              icon={<XIcon size={13} color="var(--text)" />}
              label="X / Twitter"
              placeholder="@usuario o URL"
              value={twitter}
              onChange={setTwitter}
            />
          </div>
        )}
      </div>

      <ModalField label="Notas">
        {/* Textarea (no Input) — el campo de notas es libre, multi-línea,
            y usualmente lleva varias frases. Antes era un Input de 1 línea
            y no se podían entrar saltos de línea, aunque el drawer los
            respetaba al renderizar. */}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observaciones, preferencias, regateo histórico, lo que necesites recordar de este cliente…"
          rows={4}
          style={{
            width: "100%",
            padding: "10px 12px",
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            color: "var(--text)",
            fontSize: 13,
            fontFamily: "inherit",
            lineHeight: 1.5,
            outline: "none",
            boxSizing: "border-box",
            resize: "vertical",
            minHeight: 90,
          }}
        />
      </ModalField>
    </Modal>
  );
}

/** Input compacto para una red social. Ícono + label inline a la
 *  izquierda, input a la derecha. Pensado para la sección "Redes
 *  sociales" del form donde hay 4 redes apiladas y queremos ocupar
 *  poco vertical. */
function SocialInput({
  icon,
  label,
  placeholder,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--text-muted)',
          width: 105,
          flexShrink: 0,
        }}
      >
        <span style={{ display: 'inline-flex', width: 14, justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </span>
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          padding: '8px 10px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border-strong)',
          borderRadius: 6,
          color: 'var(--text)',
          fontSize: 13,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
