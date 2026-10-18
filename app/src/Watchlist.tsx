import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  MultiSelect,
  Popover,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconUser, IconUserCheck } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { AgentKeys } from "./AgentKeys.tsx";
import type { ChartItem, ChartTheme } from "./lib/api.ts";
import { API_BASE } from "./lib/api.ts";
import { lookupSymbols, supabase, useSession, type SymbolMatch } from "./lib/supabase.ts";

/** Fired on `window` after any watchlist edit, so open charts refetch. */
export const WATCHLIST_CHANGED = "vantage:watchlist-changed";

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** What the user pastes to their agent; the instructions themselves live at /agent. */
const ONBOARD_PROMPT = `Set up Vantage for me: fetch ${API_BASE}/agent and follow its instructions.`;

/** The onboarding prompt in a small copyable field. */
function AgentOnboarding() {
  const [copied, setCopied] = useState(false);
  return (
    <Stack gap="xs">
      <Textarea
        value={ONBOARD_PROMPT}
        readOnly
        rows={4}
        size="xs"
        styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 11 } }}
      />
      <Button
        size="xs"
        onClick={() => {
          void navigator.clipboard.writeText(ONBOARD_PROMPT);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy instructions"}
      </Button>
    </Stack>
  );
}

function EmailSignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const send = async () => {
    setError(undefined);
    const { error } = await supabase!.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}${location.pathname}`,
        shouldCreateUser: false,
      },
    });
    if (error) setError(error.message);
    else setSent(true);
  };
  if (sent) return <Text size="sm">Check your email for the sign-in link.</Text>;
  return (
    // A real form with a named email field is what browsers key autofill on.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <Stack gap="xs">
        <TextInput
          size="xs"
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
        />
        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}
        <Button size="xs" type="submit" disabled={!email}>
          Send magic link
        </Button>
      </Stack>
    </form>
  );
}

/** Two plain sections: sign in by email, or onboard through an agent. */
function SignInForm() {
  const [mode, setMode] = useState<"signin" | "agent">("agent");
  return (
    <Stack gap="sm">
      <SegmentedControl
        size="xs"
        fullWidth
        value={mode}
        onChange={(v) => setMode(v as "signin" | "agent")}
        data={[
          { value: "agent", label: "Onboard via agent" },
          { value: "signin", label: "Sign in" },
        ]}
      />
      {mode === "signin" ? <EmailSignIn /> : <AgentOnboarding />}
    </Stack>
  );
}

function Editor({ accessToken }: { accessToken: string }) {
  // The editor reads the tables directly (RLS lets a signed-in user), so it works from the header without the chart data in scope.
  const [items, setItems] = useState<ChartItem[]>([]);
  const [themes, setThemes] = useState<ChartTheme[]>([]);
  const load = useCallback(async () => {
    type Row = {
      ticker: string;
      name: string;
      quote_symbol: string | null;
      currency: string | null;
      themes: string[];
      aliases: string[];
    };
    const [t, i] = await Promise.all([
      supabase!.from("watchlist_themes").select("id,label").order("position"),
      supabase!
        .from("watchlist")
        .select("ticker,name,quote_symbol,currency,themes,aliases")
        .order("position")
        .order("ticker"),
    ]);
    setThemes((t.data ?? []) as ChartTheme[]);
    setItems(
      ((i.data ?? []) as Row[]).map((r) => ({
        ticker: r.ticker,
        name: r.name,
        quoteSymbol: r.quote_symbol,
        currency: r.currency,
        themes: r.themes,
        aliases: r.aliases ?? [],
      })),
    );
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const onChanged = () => {
    void load();
    window.dispatchEvent(new Event(WATCHLIST_CHANGED));
  };
  const [error, setError] = useState<string>();
  const [groupLabel, setGroupLabel] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SymbolMatch[]>([]);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError(undefined);
    try {
      const { error } = await action();
      if (error) setError(error.message);
      else onChanged();
      return !error;
    } finally {
      setBusy(false);
    }
  };

  const addGroup = async () => {
    const ok = await run(() =>
      supabase!
        .from("watchlist_themes")
        .insert({ id: slug(groupLabel), label: groupLabel.trim(), position: themes.length }),
    );
    if (ok) setGroupLabel("");
  };

  const search = async () => {
    setError(undefined);
    try {
      const results = await lookupSymbols(query.trim(), accessToken);
      setMatches(results);
      if (results[0]) choose(results[0].symbol, results);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const choose = (value: string | null, from = matches) => {
    setSymbol(value);
    const match = from.find((m) => m.symbol === value);
    if (!match) return;
    // Ticker is the short name used across the app; the Yahoo symbol keeps its suffix.
    setTicker(match.symbol.split(".")[0].toUpperCase());
    setName(match.name);
  };

  const addCompany = async () => {
    const ok = await run(() =>
      supabase!.from("watchlist").insert({
        ticker: ticker.trim().toUpperCase(),
        name: name.trim(),
        quote_symbol: symbol,
        currency: null,
        themes: picked,
        disabled: false,
        position: items.length,
      }),
    );
    if (ok) {
      setQuery("");
      setMatches([]);
      setSymbol(null);
      setTicker("");
      setName("");
      setPicked([]);
    }
  };

  const remove = (t: string) => run(() => supabase!.from("watchlist").delete().eq("ticker", t));

  return (
    <Stack gap="lg">
      {error && (
        <Alert color="red" title="Could not save">
          {error}
        </Alert>
      )}

      <Stack gap="xs">
        <Text fw={700} size="sm">
          Groups
        </Text>
        <Group gap={6}>
          {themes.map((t) => (
            <Badge key={t.id} variant="default">
              {t.label}
            </Badge>
          ))}
        </Group>
        <Group gap="xs" align="flex-end">
          <TextInput
            size="xs"
            flex={1}
            placeholder="New group, e.g. Security software"
            value={groupLabel}
            onChange={(e) => setGroupLabel(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && groupLabel.trim() && void addGroup()}
          />
          <Button size="xs" onClick={() => void addGroup()} disabled={!groupLabel.trim() || busy}>
            Add group
          </Button>
        </Group>
      </Stack>

      <Stack gap="xs">
        <Text fw={700} size="sm">
          Add company
        </Text>
        <Group gap="xs" align="flex-end">
          <TextInput
            size="xs"
            flex={1}
            placeholder="Ticker or name, e.g. CRWD"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && query.trim() && void search()}
          />
          <Button
            size="xs"
            variant="default"
            onClick={() => void search()}
            disabled={!query.trim()}
          >
            Search
          </Button>
        </Group>
        {matches.length > 0 && (
          <>
            <Select
              size="xs"
              label="Listing"
              value={symbol}
              onChange={(value) => choose(value)}
              data={matches.map((m) => ({
                value: m.symbol,
                label: `${m.symbol} · ${m.name} · ${m.exchange}`,
              }))}
            />
            <Group gap="xs" grow>
              <TextInput
                size="xs"
                label="Ticker"
                value={ticker}
                onChange={(e) => setTicker(e.currentTarget.value)}
              />
              <TextInput
                size="xs"
                label="Name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
              />
            </Group>
            <MultiSelect
              size="xs"
              label="Groups"
              data={themes.map((t) => ({ value: t.id, label: t.label }))}
              value={picked}
              onChange={setPicked}
            />
            <Button
              size="xs"
              onClick={() => void addCompany()}
              disabled={!symbol || !ticker.trim() || !name.trim() || busy}
            >
              Add {ticker || "company"}
            </Button>
          </>
        )}
      </Stack>

      <Stack gap={4}>
        <Text fw={700} size="sm">
          Companies
        </Text>
        {items.map((item) => (
          <Group key={item.ticker} gap="xs" wrap="nowrap" justify="space-between">
            <Text size="sm" truncate>
              <Text span fw={600}>
                {item.ticker}
              </Text>{" "}
              <Text span c="dimmed">
                {item.name}
              </Text>
            </Text>
            <Group gap={4} wrap="nowrap">
              {item.themes.map((id) => (
                <Badge key={id} size="xs" variant="light">
                  {themes.find((t) => t.id === id)?.label ?? id}
                </Badge>
              ))}
              <ActionIcon
                size="xs"
                variant="subtle"
                color="red"
                aria-label={`Remove ${item.ticker}`}
                onClick={() => void remove(item.ticker)}
                disabled={busy}
              >
                ×
              </ActionIcon>
            </Group>
          </Group>
        ))}
      </Stack>
    </Stack>
  );
}

const SETTINGS = [
  { value: "watchlist", label: "Watchlist" },
  { value: "keys", label: "Agent keys" },
] as const;
type SettingsTab = (typeof SETTINGS)[number]["value"];

/** One modal, a tab per page; the menu opens it on the tab that was picked. */
function SettingsModal({
  tab,
  onClose,
  accessToken,
}: {
  tab: SettingsTab | null;
  onClose: () => void;
  accessToken: string;
}) {
  const [active, setActive] = useState<SettingsTab>("watchlist");
  useEffect(() => {
    if (tab) setActive(tab);
  }, [tab]);
  return (
    <Modal opened={tab !== null} onClose={onClose} title="Settings" size="lg">
      <Tabs value={active} onChange={(v) => v && setActive(v as SettingsTab)}>
        <Tabs.List mb="md">
          {SETTINGS.map((t) => (
            <Tabs.Tab key={t.value} value={t.value}>
              {t.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="watchlist">
          <Editor accessToken={accessToken} />
        </Tabs.Panel>
        <Tabs.Panel value="keys">
          <AgentKeys />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

/** Profile button: the sign-in form when signed out, else settings and sign out. */
export function ProfileMenu() {
  const session = useSession();
  const [settings, setSettings] = useState<SettingsTab | null>(null);
  if (!supabase) return null;
  if (!session)
    return (
      <Popover width={280} position="bottom-end" shadow="md">
        <Popover.Target>
          <ActionIcon variant="subtle" aria-label="Sign in" size="lg">
            <IconUser size={20} />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown>
          <SignInForm />
        </Popover.Dropdown>
      </Popover>
    );
  return (
    <>
      <Menu position="bottom-end" shadow="md" width={220}>
        <Menu.Target>
          <ActionIcon variant="subtle" aria-label="Account" size="lg">
            <IconUserCheck size={20} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{session.user.email}</Menu.Label>
          <Menu.Label>Settings</Menu.Label>
          {SETTINGS.map((t) => (
            <Menu.Item key={t.value} onClick={() => setSettings(t.value)}>
              {t.label}
            </Menu.Item>
          ))}
          <Menu.Divider />
          <Menu.Item onClick={() => void supabase!.auth.signOut()}>Sign out</Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <SettingsModal
        tab={settings}
        onClose={() => setSettings(null)}
        accessToken={session.access_token}
      />
    </>
  );
}
