import { Anchor, Group, Text } from "@mantine/core";
import { IconBrandGithub } from "@tabler/icons-react";

const REPO = "https://github.com/thisismydesign/vantage";

export function Footer() {
  return (
    <Group
      component="footer"
      justify="center"
      gap="sm"
      pt="xl"
      mt="auto"
      c="dimmed"
      fz="xs"
      style={{ rowGap: 4 }}
    >
      <Text inherit>© {new Date().getFullYear()} Vantage</Text>
      <Text inherit aria-hidden>
        ·
      </Text>
      <Text inherit>
        Open source under the{" "}
        <Anchor inherit href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener">
          MIT license
        </Anchor>
      </Text>
      <Text inherit aria-hidden>
        ·
      </Text>
      <Anchor
        inherit
        href={REPO}
        target="_blank"
        rel="noopener"
        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <IconBrandGithub size={14} />
        GitHub
      </Anchor>
    </Group>
  );
}
