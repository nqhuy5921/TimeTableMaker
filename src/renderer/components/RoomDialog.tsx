import { addRoom } from '../../domain/lists';
import type { Id, TimetableFile } from '../../domain/model';
import { editRoom } from '../../domain/rooms';
import { NameDialog } from './NameDialog';

interface RoomDialogProps {
  file: TimetableFile;
  /** The room to rename, or null to add one. */
  roomId: Id | null;
  /** Commits the changed file and closes the form. */
  onDone: (file: TimetableFile) => void;
  onCancel: () => void;
}

// The room form (DM-3, layout spec "Room form and Subject form"): one Name field, unique
// among the rooms. Mount it to open it and unmount it to close it.
export function RoomDialog({ file, roomId, onDone, onCancel }: RoomDialogProps) {
  const editing = roomId === null ? undefined : file.rooms.find((r) => r.id === roomId);
  return (
    <NameDialog
      title={editing ? `Edit ${editing.name}` : 'Add room'}
      label="Name"
      submitLabel={editing ? 'Save' : 'Add room'}
      initialName={editing?.name}
      wide
      onSubmit={(name) => {
        const result = editing ? editRoom(file, editing.id, name) : addRoom(file, name);
        if (!result.ok) return result.error;
        onDone(result.file);
        return null;
      }}
      onCancel={onCancel}
    />
  );
}
