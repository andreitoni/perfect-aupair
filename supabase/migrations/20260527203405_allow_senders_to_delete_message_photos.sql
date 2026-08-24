create policy "Message senders can update their own messages"
on public.messages
for update
to authenticated
using (sender_id = (select auth.uid()))
with check (sender_id = (select auth.uid()));

create policy "Message senders can delete their own messages"
on public.messages
for delete
to authenticated
using (sender_id = (select auth.uid()));

create policy "Message senders can delete their own message photo files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'message-photos'
  and exists (
    select 1
    from public.messages m
    where m.image_path = storage.objects.name
      and m.sender_id = (select auth.uid())
  )
);
