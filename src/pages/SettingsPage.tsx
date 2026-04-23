import { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/types/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MessageSquare, ListTodo, Bell, Upload, X, Trash2, Loader2 } from 'lucide-react';
import { useSoundPreferences } from '@/hooks/useSoundPreferences';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const AVATAR_TARGET_SIZE = 256; // px — stored size
const AVATAR_PREVIEW_SIZE = 96; // px — display size on this page
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function resizeImageToSquare(file: File, size: number): Promise<{ base64: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      img.onerror = () => reject(new Error('Could not load image'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));

        // object-fit: cover crop
        const sourceSize = Math.min(img.width, img.height);
        const sx = (img.width - sourceSize) / 2;
        const sy = (img.height - sourceSize) / 2;
        ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, size, size);

        const contentType = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(contentType, 0.9);
        const base64 = dataUrl.split(',')[1] ?? '';
        resolve({ base64, contentType });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  const { user, roles, refreshProfile, getToken } = useAuth();
  const soundPrefs = useSoundPreferences();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [savingName, setSavingName] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stagedPreview, setStagedPreview] = useState<string | null>(null);
  const [stagedPayload, setStagedPayload] = useState<{ base64: string; contentType: string; fileName: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const initials = user?.displayName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const trimmedName = displayName.trim();
  const nameChanged = trimmedName !== (user?.displayName ?? '').trim();
  const nameValid = trimmedName.length >= 2 && trimmedName.length <= 100;

  const handleSaveName = async () => {
    if (!nameChanged || !nameValid) return;
    setSavingName(true);
    try {
      const { error } = await supabase.functions.invoke('sync-profile', {
        body: { action: 'update_profile', display_name: trimmedName },
      });
      if (error) throw error;
      toast.success('Name updated');
      await refreshProfile();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Please choose a JPG, PNG, or WEBP image');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Image is too large (max 2 MB)');
      return;
    }
    try {
      const { base64, contentType } = await resizeImageToSquare(file, AVATAR_TARGET_SIZE);
      setStagedPayload({ base64, contentType, fileName: file.name });
      setStagedPreview(`data:${contentType};base64,${base64}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not process image');
    }
  };

  const handleCancelStaged = () => {
    setStagedPayload(null);
    setStagedPreview(null);
  };

  const handleUploadAvatar = async () => {
    if (!stagedPayload) return;
    setUploading(true);
    try {
      const { error } = await supabase.functions.invoke('sync-profile', {
        body: {
          action: 'upload_avatar',
          file_base64: stagedPayload.base64,
          content_type: stagedPayload.contentType,
          file_name: stagedPayload.fileName,
        },
      });
      if (error) throw error;
      toast.success('Profile photo updated');
      setStagedPayload(null);
      setStagedPreview(null);
      await refreshProfile();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setRemoving(true);
    try {
      const { error } = await supabase.functions.invoke('sync-profile', {
        body: { action: 'update_profile', avatar_url: null },
      });
      if (error) throw error;
      toast.success('Profile photo removed');
      await refreshProfile();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove photo');
    } finally {
      setRemoving(false);
    }
  };

  const displayedAvatar = stagedPreview ?? user?.avatarUrl;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">Profile & Settings</h1>

      <Card className="border">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Avatar block */}
            <div className="flex flex-col items-center sm:items-start gap-2">
              <div
                className="relative rounded-full overflow-hidden bg-muted ring-2 ring-border"
                style={{ width: AVATAR_PREVIEW_SIZE, height: AVATAR_PREVIEW_SIZE }}
              >
                <Avatar className="h-full w-full">
                  <AvatarImage src={displayedAvatar} className="object-cover" />
                  <AvatarFallback className="text-2xl bg-primary text-primary-foreground font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>
              <p className="text-[11px] text-muted-foreground text-center sm:text-left max-w-[180px] leading-tight">
                Recommended: square image,<br />256×256, max 2 MB.<br />JPG, PNG, or WEBP.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileSelected}
              />

              {!stagedPayload ? (
                <div className="flex flex-col gap-1 w-full">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full"
                  >
                    <Upload className="mr-2 h-3.5 w-3.5" />
                    Change photo
                  </Button>
                  {user?.avatarUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveAvatar}
                      disabled={removing}
                      className="w-full text-destructive hover:text-destructive h-7 text-xs"
                    >
                      {removing ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 h-3 w-3" />
                      )}
                      Remove photo
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1 w-full">
                  <Button size="sm" onClick={handleUploadAvatar} disabled={uploading} className="w-full">
                    {uploading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-2 h-3.5 w-3.5" />}
                    Upload
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleCancelStaged} disabled={uploading} className="w-full h-7 text-xs">
                    <X className="mr-1 h-3 w-3" />
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            {/* Identity block */}
            <div className="flex-1 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="display-name" className="text-xs font-medium">Display name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={100}
                  placeholder="Your name"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    {nameValid ? `${trimmedName.length}/100` : 'Must be 2–100 characters'}
                  </p>
                  <Button
                    size="sm"
                    onClick={handleSaveName}
                    disabled={!nameChanged || !nameValid || savingName}
                  >
                    {savingName && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Save name
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Email</Label>
                <p className="text-sm text-muted-foreground">{user?.email || 'No email'}</p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Roles</Label>
                <div className="flex flex-wrap gap-1">
                  {roles.length > 0 ? (
                    roles.map((role) => (
                      <Badge key={role} variant="secondary" className="text-[10px]">
                        {ROLE_LABELS[role]}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No roles assigned</p>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">Email and roles are managed by an administrator.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Notification Sounds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="sound-messages" className="text-sm font-medium">Message sounds</Label>
                <p className="text-xs text-muted-foreground">Play a sound when you receive a new message</p>
              </div>
            </div>
            <Switch
              id="sound-messages"
              checked={soundPrefs.messages}
              onCheckedChange={() => soundPrefs.toggle('messages')}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ListTodo className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="sound-tasks" className="text-sm font-medium">Task sounds</Label>
                <p className="text-xs text-muted-foreground">Play a sound for task assignments and status changes</p>
              </div>
            </div>
            <Switch
              id="sound-tasks"
              checked={soundPrefs.tasks}
              onCheckedChange={() => soundPrefs.toggle('tasks')}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="sound-notifications" className="text-sm font-medium">Notification sounds</Label>
                <p className="text-xs text-muted-foreground">Play a sound for general notifications (leaves, etc.)</p>
              </div>
            </div>
            <Switch
              id="sound-notifications"
              checked={soundPrefs.notifications}
              onCheckedChange={() => soundPrefs.toggle('notifications')}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
