import { useRef, useState } from 'react';
import type { Id, Room } from '../../domain/model';
import { deleteRoom, roomDeletionLines, roomRows } from '../../domain/rooms';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ListPage, RowActions } from '../components/ListPage';
import { RoomDialog } from '../components/RoomDialog';
import { useReturnFocus } from '../components/useReturnFocus';
import { useAppStore } from '../state/appStore';

// The Rooms page (DM-3, layout spec "List pages for classes, rooms, and subjects"): every
// room in list order with how many cards use it and the classes it's used in, a search,
// and Add room. Edit opens the room form and Delete asks first.
export function RoomsScreen() {
  const { state, commit } = useAppStore();
  // The page's own search, empty again on each visit, as on the Teachers page.
  const [query, setQuery] = useState('');
  // The room form (adding when roomId is null) or the delete question.
  const [form, setForm] = useState<{ roomId: Id | null } | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  // Focus goes back to the button that opened the form or question, or to Add room when
  // its row is gone.
  const { remember, restore } = useReturnFocus(addRef);
  const rows = roomRows(state.file, query);

  function close() {
    setForm(null);
    setDeleting(null);
    restore();
  }

  return (
    <>
      <ListPage
        title="Rooms"
        noun={{ one: 'room', many: 'rooms' }}
        total={state.file.rooms.length}
        matches={rows.length}
        search={{ query, onQueryChange: setQuery }}
        addRef={addRef}
        onAdd={() => {
          remember();
          setForm({ roomId: null });
        }}
      >
        <table className="list-table rooms-table" aria-label="Rooms">
          <thead>
            <tr>
              <th scope="col">Room</th>
              <th scope="col" className="list-table-number">
                Cards
              </th>
              <th scope="col">Classes</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ room, cards, classes }) => (
              <tr key={room.id}>
                <th scope="row" className="list-table-name">
                  {room.name}
                </th>
                <td className="list-table-number">{cards}</td>
                {classes.length > 0 ? (
                  <td className="list-table-classes">{classes.map((c) => c.name).join(', ')}</td>
                ) : (
                  <td className="list-table-none">Not used</td>
                )}
                <RowActions
                  name={room.name}
                  onEdit={() => {
                    remember();
                    setForm({ roomId: room.id });
                  }}
                  onDelete={() => {
                    remember();
                    setDeleting(room);
                  }}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </ListPage>
      {form && (
        <RoomDialog
          file={state.file}
          roomId={form.roomId}
          onDone={(file) => {
            commit({ ...state, file });
            close();
          }}
          onCancel={close}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          lines={roomDeletionLines(state.file, deleting.id)}
          keepLabel="Keep the room"
          confirm={{
            label: 'Delete room',
            onConfirm: () => {
              commit({ ...state, file: deleteRoom(state.file, deleting.id) });
              close();
            },
          }}
          onCancel={close}
        />
      )}
    </>
  );
}
