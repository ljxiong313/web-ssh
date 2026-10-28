import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Text as UiText } from '@/components/ui/text';
import { folderApi, type Folder as FolderType } from '@/client/api';
import { ConnectionForm } from '@/pages/connections/ConnectionForm';

interface AddConnectionPanelProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddConnectionPanel({ open, onClose, onSaved }: AddConnectionPanelProps) {
  const [folders, setFolders] = useState<FolderType[]>([]);

  useEffect(() => {
    if (open) {
      folderApi.list().then(setFolders).catch(() => setFolders([]));
    }
  }, [open]);

  const handleSave = () => {
    onClose();
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="lg" style={{ maxHeight: '90%' }}>
        <DialogHeader><DialogTitle><UiText>添加连接</UiText></DialogTitle></DialogHeader>
        <ConnectionForm folders={folders} onSave={handleSave} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
