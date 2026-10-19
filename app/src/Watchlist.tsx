import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  MultiSelect,
  PasswordInput,
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
import {
  MIN_PASSWORD_LENGTH,
  type ChartItem,
  type ChartTheme,
  type SymbolMatch,
} from "@shared/api.ts";
import { API_BASE } from "./lib/api.ts";
import { lookupSymbols, signInAsDevAccount, signUp, supabase, useSession } from "./lib/supabase.ts";

/** Fired on `window` after any watchlist edit, so open charts refetch. */
export const WATCHLIST_CHANGED = "vantage:watchlist-changed";
export const OPEN_SIGN_IN = "vantage:open-sign-in";

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const ONBOARD_PROMPT = `Set up Vantage for me: fetch ${API_BASE}/agent and follow its instructions.`;

function AgentOnboarding() {
  const [copied, setCopied] = useState(false);
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        Or have your agent set it up:
      </Text>
      <Textarea
        value={ONBOARD_PROMPT}
        readOnly
        rows={4}
        size="xs"
        styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 11 } }}
      />
      <Button
        size="xs"
        variant="light"
        onClick={() => {
          void navigator.clipboard.writeText(ONBOARD_PROMPT);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy agent instructions"}
      </Button>
    </Stack>
  );
}

type AuthMode = "signin" | "signup";

function PasswordForm({ mode }: { mode: AuthMode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";
  const submit = async () => {
    setError(undefined);
    setBusy(true);
    try {
      if (signup) await signUp(email, password);
      else {
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    // A real form with named fields is what browsers and password managers key autofill on.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
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
        <PasswordInput
          size="xs"
          label="Password"
          name="password"
          autoComplete={signup ? "new-password" : "current-password"}
          description={
            signup
              ? `At least ${MIN_PASSWORD_LENGTH} characters. There is no reset by email, so keep it in a password manager.`
              : undefined
          }
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
        />
        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}
        <Button
          size="xs"
          type="submit"
          loading={busy}
          disabled={!email || password.length < (signup ? MIN_PASSWORD_LENGTH : 1)}
        >
          {signup ? "Create account" : "Sign in"}
        </Button>
      </Stack>
    </form>
  );
}

function AuthForms({ mode, onMode }: { mode: AuthMode; onMode: (mode: AuthMode) => void }) {
  return (
    <Stack gap="sm">
      <SegmentedControl
        size="xs"
        fullWidth
        value={mode}
        onChange={(v) => onMode(v as AuthMode)}
        data={[
          { value: "signin", label: "Sign in" },
          { value: "signup", label: "Sign up" },
        ]}
      />
      <PasswordForm key={mode} mode={mode} />
      {mode === "signup" && <AgentOnboarding />}
    </Stack>
  );
}

function ChangePassword() {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<{ busy?: boolean; done?: boolean; error?: string }>({});
  const save = async () => {
    setState({ busy: true });
    const { error } = await supabase!.auth.updateUser({ password });
    setState(error ? { error: error.message } : { done: true });
    if (!error) setPassword("");
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Stack gap="xs" maw={320}>
        <PasswordInput
          size="xs"
          label="New password"
          name="new-password"
          autoComplete="new-password"
          description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          value={password}
          onChange={(e) => {
            setPassword(e.currentTarget.value);
            setState({});
          }}
        />
        {state.error && (
          <Text size="xs" c="red">
            {state.error}
          </Text>
        )}
        {state.done && <Text size="xs">Password changed.</Text>}
        <Button
          size="xs"
          type="submit"
          loading={state.busy}
          disabled={password.length < MIN_PASSWORD_LENGTH}
        >
          Change password
        </Button>
      </Stack>
    </form>
  );
}

function Editor({ accessToken }: { accessToken: string }) {
  // Reads the tables directly (RLS allows it) so it works from the header without chart data.
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
  { value: "password", label: "Password" },
] as const;
type SettingsTab = (typeof SETTINGS)[number]["value"];

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
        <Tabs.Panel value="password">
          <ChangePassword />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

export function ProfileMenu() {
  const session = useSession();
  const [settings, setSettings] = useState<SettingsTab | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");
  useEffect(() => {
    // The demo banner's call to sign up.
    const open = () => {
      setMode("signup");
      setSignInOpen(true);
    };
    window.addEventListener(OPEN_SIGN_IN, open);
    return () => window.removeEventListener(OPEN_SIGN_IN, open);
  }, []);
  if (!supabase) return null;
  if (!session)
    return (
      <Popover
        width={280}
        position="bottom-end"
        shadow="md"
        opened={signInOpen}
        onChange={setSignInOpen}
      >
        <Popover.Target>
          <ActionIcon
            variant="subtle"
            aria-label="Sign in"
            size="lg"
            onClick={() => {
              setMode("signin");
              // Locally, the icon signs straight in as the dev account; the banner link still opens the forms.
              if (import.meta.env.DEV) signInAsDevAccount().catch(() => setSignInOpen(true));
              else setSignInOpen((o) => !o);
            }}
          >
            <IconUser size={20} />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown>
          <AuthForms mode={mode} onMode={setMode} />
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
