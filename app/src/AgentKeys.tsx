// Agent keys: the owner makes one per agent and hands it over; a cold agent
// trades it for a session. The key is generated and hashed here, shown once.

import {
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import type { ApiKey } from "@shared/types.ts";
import { KEY_SHOWN, newKey, sha256Hex } from "../../supabase/functions/_shared/keys.ts";
import { displayDateTime } from "./lib/format.ts";
import { supabase } from "./lib/supabase.ts";

export function AgentKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase!
      .from("api_keys")
      .select("id,name,prefix,created_at,last_used_at,revoked_at")
      .order("created_at");
    if (error) setError(error.message);
    else setKeys((data ?? []) as ApiKey[]);
  }, []);
  useEffect(() => void load(), [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const create = () =>
    run(async () => {
      const key = newKey();
      const { error } = await supabase!.from("api_keys").insert({
        name: name.trim(),
        prefix: key.slice(0, KEY_SHOWN),
        key_hash: await sha256Hex(key),
      });
      if (error) throw new Error(error.message);
      setFresh(key);
      setName("");
    });
  const revoke = (id: string) =>
    run(async () => {
      const { error } = await supabase!
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    });
  const remove = (id: string) =>
    run(async () => {
      const { error } = await supabase!.from("api_keys").delete().eq("id", id);
      if (error) throw new Error(error.message);
    });

  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        Keys give your agents access to your account.
      </Text>
      {fresh && (
        <Alert
          color="yellow"
          title="Copy the key now; it is not shown again"
          withCloseButton
          onClose={() => setFresh(null)}
        >
          <Group gap="xs" wrap="nowrap">
            <Code style={{ wordBreak: "break-all" }}>{fresh}</Code>
            <CopyButton value={fresh}>
              {({ copied, copy }) => (
                <Button size="compact-xs" variant="light" onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              )}
            </CopyButton>
          </Group>
        </Alert>
      )}
      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void create();
        }}
      >
        <Group gap="xs" align="flex-end">
          <TextInput
            size="xs"
            label="New key"
            placeholder="Which agent is this for?"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button size="xs" type="submit" disabled={!name.trim() || busy}>
            Create key
          </Button>
        </Group>
      </form>
      {keys.length > 0 && (
        <Table fz="xs" verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Key</Table.Th>
              <Table.Th>Last used</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {keys.map((k) => (
              <Table.Tr key={k.id} c={k.revoked_at ? "dimmed" : undefined}>
                <Table.Td>{k.name}</Table.Td>
                <Table.Td>
                  <Code>{k.prefix}…</Code>
                </Table.Td>
                <Table.Td>
                  {k.revoked_at
                    ? `revoked ${displayDateTime(k.revoked_at)}`
                    : k.last_used_at
                      ? displayDateTime(k.last_used_at)
                      : "never"}
                </Table.Td>
                <Table.Td ta="right">
                  {k.revoked_at ? (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      onClick={() => remove(k.id)}
                      disabled={busy}
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="red"
                      onClick={() => revoke(k.id)}
                      disabled={busy}
                    >
                      Revoke
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
