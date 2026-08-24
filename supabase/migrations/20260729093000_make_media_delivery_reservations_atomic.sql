-- Do not charge earlier delivery scopes when a later shared quota rejects the
-- same request. The exception blocks below act as savepoints: denied results
-- are preserved in variables while every reservation made by the internal
-- function is rolled back.

alter function public.get_profile_photo_media_access(
  text, uuid, boolean, text, text
) rename to get_profile_photo_media_access_nonatomic_internal;

revoke all on function public.get_profile_photo_media_access_nonatomic_internal(
  text, uuid, boolean, text, text
) from public, anon, authenticated, service_role;

create function public.get_profile_photo_media_access(
  p_storage_path text,
  p_viewer_id uuid,
  p_is_admin boolean,
  p_ip_hash text,
  p_ip_prefix_hash text
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  storage_path text
)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '250ms'
as $$
declare
  v_has_result boolean := false;
  v_allowed boolean;
  v_retry_after_seconds integer;
  v_storage_path text;
begin
  begin
    select access.allowed, access.retry_after_seconds, access.storage_path
    into v_allowed, v_retry_after_seconds, v_storage_path
    from public.get_profile_photo_media_access_nonatomic_internal(
      p_storage_path,
      p_viewer_id,
      p_is_admin,
      p_ip_hash,
      p_ip_prefix_hash
    ) access;
    v_has_result := found;

    if v_has_result and v_allowed is not true then
      raise sqlstate 'PA001' using message = 'Profile media reservation denied';
    end if;
  exception when sqlstate 'PA001' then
    return query
    select v_allowed, v_retry_after_seconds, v_storage_path;
    return;
  end;

  if v_has_result then
    return query
    select v_allowed, v_retry_after_seconds, v_storage_path;
  end if;
end;
$$;

revoke all on function public.get_profile_photo_media_access(
  text, uuid, boolean, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.get_profile_photo_media_access(
  text, uuid, boolean, text, text
) to service_role;

alter function public.get_private_media_access(
  text, text, uuid, boolean, text, text, bigint, bigint, bigint
) rename to get_private_media_access_nonatomic_internal;

revoke all on function public.get_private_media_access_nonatomic_internal(
  text, text, uuid, boolean, text, text, bigint, bigint, bigint
) from public, anon, authenticated, service_role;

create function public.get_private_media_access(
  p_bucket_id text,
  p_storage_path text,
  p_viewer_id uuid,
  p_is_admin boolean,
  p_ip_hash text,
  p_ip_prefix_hash text,
  p_range_start bigint default null,
  p_range_end bigint default null,
  p_range_suffix bigint default null
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  storage_path text,
  object_size_bytes bigint,
  charged_bytes bigint
)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '250ms'
as $$
declare
  v_has_result boolean := false;
  v_allowed boolean;
  v_retry_after_seconds integer;
  v_storage_path text;
  v_object_size_bytes bigint;
  v_charged_bytes bigint;
begin
  begin
    select
      access.allowed,
      access.retry_after_seconds,
      access.storage_path,
      access.object_size_bytes,
      access.charged_bytes
    into
      v_allowed,
      v_retry_after_seconds,
      v_storage_path,
      v_object_size_bytes,
      v_charged_bytes
    from public.get_private_media_access_nonatomic_internal(
      p_bucket_id,
      p_storage_path,
      p_viewer_id,
      p_is_admin,
      p_ip_hash,
      p_ip_prefix_hash,
      p_range_start,
      p_range_end,
      p_range_suffix
    ) access;
    v_has_result := found;

    if v_has_result and v_allowed is not true then
      raise sqlstate 'PA002' using message = 'Private media reservation denied';
    end if;
  exception when sqlstate 'PA002' then
    return query
    select
      v_allowed,
      v_retry_after_seconds,
      v_storage_path,
      v_object_size_bytes,
      v_charged_bytes;
    return;
  end;

  if v_has_result then
    return query
    select
      v_allowed,
      v_retry_after_seconds,
      v_storage_path,
      v_object_size_bytes,
      v_charged_bytes;
  end if;
end;
$$;

revoke all on function public.get_private_media_access(
  text, text, uuid, boolean, text, text, bigint, bigint, bigint
) from public, anon, authenticated, service_role;
grant execute on function public.get_private_media_access(
  text, text, uuid, boolean, text, text, bigint, bigint, bigint
) to service_role;
