import { ThemePicker } from "@/components/theme/ThemePicker";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">设置</h1>

      <section
        aria-labelledby="settings-theme-heading"
        className="rounded-[var(--radius)] border border-border bg-bg p-5"
      >
        <h2 id="settings-theme-heading" className="mb-1 text-lg font-medium">
          主题
        </h2>
        <p className="mb-4 text-sm text-muted-fg">
          选择界面配色与明暗模式。会立即生效并保存到本设备。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <ThemePicker />
          <ThemeToggle />
        </div>
      </section>

      <nav className="mt-6 text-sm">
        <a
          href="/settings/providers"
          className="text-accent hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          自定义 LLM 服务商 →
        </a>
      </nav>
    </main>
  );
}
