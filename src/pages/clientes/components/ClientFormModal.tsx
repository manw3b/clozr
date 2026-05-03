import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, ModalField } from '../../../components/Modal';
import { Button } from '../../../components/Button';
import { Input, Select } from '../../../components/Input';
import { customersDb } from '../../../lib/db/customers';
import { invalidate } from '../../../lib/queryKeys';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { useUIStore } from '../../../store/uiStore';
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

  useEffect(() => {
    if (open) {
      setName(client?.name ?? '');
      setPhone(client?.phone ?? '');
      setEmail(client?.email ?? '');
      setType(client?.type ?? 'final');
      setNotes(client?.notes ?? '');
    }
  }, [open, client]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspace) throw new Error('Sin workspace activo');
      if (editing && client) {
        await customersDb.update(activeWorkspace.id, client.id, {
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          type,
          notes: notes.trim() || null,
        });
      } else {
        await customersDb.create(activeWorkspace.id, {
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          type,
          notes: notes.trim() || null,
        });
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
        type !== "final"
      );
    }
    return (
      name !== (client.name ?? "") ||
      phone !== (client.phone ?? "") ||
      email !== (client.email ?? "") ||
      type !== (client.type ?? "final") ||
      notes !== (client.notes ?? "")
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

      <ModalField label="Notas">
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observaciones, preferencias…"
        />
      </ModalField>
    </Modal>
  );
}
