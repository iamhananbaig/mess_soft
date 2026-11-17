import { useState } from 'react';
import api from '@/services/api';
import { showToast, showErrorToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/FormField';

const EMPTY = { current_password: '', password: '', password_confirmation: '' };

/** Self-service password change for the signed-in user. Other devices are signed out. */
export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const mismatch = form.password_confirmation !== '' && form.password !== form.password_confirmation;

  const close = (o: boolean) => {
    if (!o) setForm(EMPTY);
    onOpenChange(o);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/me/password', form);
      showToast('Password changed. Other devices have been signed out.', 'success');
      close(false);
    } catch (err) {
      const errors = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors;
      const first = errors && Object.values(errors)[0]?.[0];
      if (first) showToast(first, 'error');
      else showErrorToast(err, 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>You'll stay signed in here; other devices will be signed out.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Current password" required>
            <Input type="password" autoComplete="current-password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} required autoFocus />
          </FormField>
          <FormField label="New password (min 8 characters)" required>
            <Input type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </FormField>
          <FormField label="Confirm new password" required>
            <Input type="password" autoComplete="new-password" value={form.password_confirmation} onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })} required />
            {mismatch && <p className="text-xs text-destructive">Passwords don't match.</p>}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || mismatch || form.password.length < 8}>Change password</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
