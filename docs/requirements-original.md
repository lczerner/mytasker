# Original requirements (owner, 2026-11-19)

The owner wrote this list before the detailed task. It is kept as written.

```text
Task should contain at least:
  - name
  - description
  - status (new, assigned, posponed, done, verified, deleted)
  - tags
  - date and time it was created
  - date and time it should be done
  - attach documents and links
  - bulletpoints as small subtasks
  - list of assigned users
  - conversation between the users

Admin and users:
  - Admin has all priviledges, adding and removing users, alter all settings and adding and removing tasks and all other items
  - Admin can assign and remove users from/to any task
  - Users can do all operations on tasks except deletion - they can only delete tasks they have created themselves
  - Only selected users can mark tasks verified.

Task lifecycle:
  - new (Nový) when it is created but noone is assigned yet
  - assigned (Přiřazeno) when user is assigned to task
  - postponed (Odloženo) user can postpone the task which clears to due date
  - done (Hotovo) user can mark task as done noting the date it was finished, but it is not the end, selected users (superiors) still have to verify that the task was actually done
  - Verified (Zkontrolováno) only selected users (admin can set it) can mark task as verified

Filtering:
  - by tag, assigned user, status, search

The main windows should show all tasks and their status in well arranged view
allowing users to filter it. Notifying users when their tasks due date is approaching or
it is past due time. Notifying verifiers that there are tasks to be verified.

Users should also easily see what tasks they have assigned.

Make it simple, clean, well readable and easy to use. Translate the app in Czech language.
```
