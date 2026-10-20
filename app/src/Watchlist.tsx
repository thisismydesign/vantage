import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  MultiSelect,
  Paper,
  PasswordInput,
  Popover,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DraggableProvided,
  type DropResult,
} from "@hello-pangea/dnd";
import { IconGripVertical, IconUser, IconUserCheck } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { AgentKeys } from "./AgentKeys.tsx";
import { groupColors, groupTint } from "./theme.ts";
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

// Spelled out rather than "fetch this URL and follow it", so the user can read what they hand their agent.
const ONBOARD_PROMPT = `Set up a Vantage account for me. Vantage (${location.origin}) is my portfolio manager: watchlist, calendar, news and broker account.

1. Ask me for my email address, and whether I want to choose a password or have Vantage make one.
2. Ask whether I want Vantage's default watchlist or my own list of companies.
3. Create the account: POST ${API_BASE}/onboard with JSON {"email", "password" (optional), and "defaults": true or my own "groups" and "items"}. The API is described at ${API_BASE}/openapi.json.
4. Tell me the email and password to sign in with at ${location.origin}. Store the refresh_token from the response somewhere durable, and tell me where.

How to keep Vantage up to date for me afterwards is at ${API_BASE}/agent.`;

function AgentOnboarding() {
  const [copied, setCopied] = useState(false);
  return (
    <Stack gap="xs">
      <Textarea
        value={ONBOARD_PROMPT}
        readOnly
        autosize
        minRows={8}
        maxRows={14}
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

type AuthMode = "signin" | "signup" | "agent";

function PasswordForm({ mode }: { mode: "signin" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";
  // Locally, signing in with both fields empty means the dev account.
  const devAccount = import.meta.env.DEV && !signup && !email && !password;
  const ready = devAccount || (!!email && !!password);
  const submit = async () => {
    if (signup && password.length < MIN_PASSWORD_LENGTH)
      return setError(`The password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
    setError(undefined);
    setBusy(true);
    try {
      if (devAccount) await signInAsDevAccount();
      else if (signup) await signUp(email, password);
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
          placeholder={import.meta.env.DEV && !signup ? "Empty for the dev account" : undefined}
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
        />
        <PasswordInput
          size="xs"
          label="Password"
          name="password"
          autoComplete={signup ? "new-password" : "current-password"}
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
          disabled={!ready}
          // Disabled buttons lose their border; keep one so it still reads as a button.
          bd={ready ? undefined : "1px solid var(--mantine-color-default-border)"}
        >
          {signup ? "Create account" : "Sign in"}
        </Button>
      </Stack>
    </form>
  );
}

function AuthForms({ mode, onMode }: { mode: AuthMode; onMode: (mode: AuthMode) => void }) {
  const choice = (value: AuthMode, label: string) => (
    <Button
      size="xs"
      fullWidth
      variant="default"
      // The selected one keeps the hover gray.
      bg={mode === value ? "var(--mantine-color-default-hover)" : undefined}
      aria-pressed={mode === value}
      onClick={() => onMode(value)}
    >
      {label}
    </Button>
  );
  return (
    <Stack gap="sm">
      <Stack gap={6}>
        {choice("agent", "Onboard with your AI agent")}
        <SimpleGrid cols={2} spacing={6}>
          {choice("signin", "Sign in")}
          {choice("signup", "Sign up")}
        </SimpleGrid>
      </Stack>
      {mode === "agent" ? <AgentOnboarding /> : <PasswordForm key={mode} mode={mode} />}
    </Stack>
  );
}

function ChangePassword() {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<{ busy?: boolean; done?: boolean; error?: string }>({});
  const save = async () => {
    if (password.length < MIN_PASSWORD_LENGTH)
      return setState({ error: `The password needs at least ${MIN_PASSWORD_LENGTH} characters.` });
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
        <Button size="xs" type="submit" loading={state.busy} disabled={!password}>
          Change password
        </Button>
      </Stack>
    </form>
  );
}

function GroupRow({
  drag,
  theme,
  color,
  count,
}: {
  drag: DraggableProvided;
  theme: ChartTheme;
  color: string;
  count: number;
}) {
  return (
    <Paper
      ref={drag.innerRef}
      {...drag.draggableProps}
      withBorder
      radius="sm"
      px="xs"
      py={4}
      style={{ ...drag.draggableProps.style, background: groupTint(color) }}
    >
      <Group gap="xs" wrap="nowrap">
        <Box
          {...drag.dragHandleProps}
          aria-label={`Move ${theme.label}`}
          style={{ display: "flex", cursor: "grab" }}
        >
          <IconGripVertical size={16} />
        </Box>
        <Text size="sm" fw={600}>
          {theme.label}
        </Text>
        <Badge variant="default" size="sm">
          {count}
        </Badge>
      </Group>
    </Paper>
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

  const colorOf = groupColors(themes);
  const countOf = (id: string) => items.filter((i) => i.themes.includes(id)).length;
  // Every group takes its new place at once; if a write fails, the saved order comes back.
  const reorder = async ({ source, destination }: DropResult) => {
    if (!destination || destination.index === source.index) return;
    const next = [...themes];
    const [moved] = next.splice(source.index, 1);
    next.splice(destination.index, 0, moved);
    setThemes(next);
    const ok = await run(async () => {
      const writes = await Promise.all(
        next.map((t, position) =>
          supabase!.from("watchlist_themes").update({ position }).eq("id", t.id),
        ),
      );
      return { error: writes.find((w) => w.error)?.error ?? null };
    });
    if (!ok) void load();
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
        <Group gap="xs" align="baseline">
          <Text fw={700} size="sm">
            Groups
          </Text>
          <Text size="xs" c="dimmed">
            Drag to reorder the watchlist and portfolio.
          </Text>
        </Group>
        <DragDropContext onDragEnd={(result) => void reorder(result)}>
          <Droppable
            droppableId="groups"
            // The dialog's transform would offset the dragged row; the clone is drawn on the page instead.
            renderClone={(drag, _, rubric) => (
              <GroupRow
                drag={drag}
                theme={themes[rubric.source.index]}
                color={colorOf(themes[rubric.source.index].id)}
                count={countOf(themes[rubric.source.index].id)}
              />
            )}
          >
            {(drop) => (
              <Stack gap={4} ref={drop.innerRef} {...drop.droppableProps}>
                {themes.map((t, index) => (
                  <Draggable key={t.id} draggableId={t.id} index={index} isDragDisabled={busy}>
                    {(drag) => (
                      <GroupRow drag={drag} theme={t} color={colorOf(t.id)} count={countOf(t.id)} />
                    )}
                  </Draggable>
                ))}
                {drop.placeholder}
              </Stack>
            )}
          </Droppable>
        </DragDropContext>
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
                <Badge key={id} size="xs" variant="light" color={colorOf(id)}>
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
  const [mode, setMode] = useState<AuthMode>("agent");
  useEffect(() => {
    // The demo banner's call to sign up.
    const open = () => {
      setMode("agent");
      setSignInOpen(true);
    };
    window.addEventListener(OPEN_SIGN_IN, open);
    return () => window.removeEventListener(OPEN_SIGN_IN, open);
  }, []);
  if (!supabase) return null;
  if (!session)
    return (
      <Popover
        width={320}
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
              setMode("agent");
              setSignInOpen((o) => !o);
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
