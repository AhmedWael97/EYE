$base = "h:\coupons\githubs\eye\frontend\src\app\[locale]"
$dirs = @(
  "$base\(app)\dashboard\realtime",
  "$base\(app)\dashboard\visitors",
  "$base\(app)\dashboard\analytics",
  "$base\(app)\dashboard\funnels",
  "$base\(app)\dashboard\ai",
  "$base\(app)\dashboard\ux",
  "$base\(app)\dashboard\custom-events",
  "$base\(app)\dashboard\identities",
  "$base\(app)\dashboard\companies",
  "$base\(app)\dashboard\replay",
  "$base\(app)\dashboard\shared-reports",
  "$base\(app)\dashboard\exports",
  "$base\(app)\dashboard\website-chatbot",
  "$base\(app)\settings\domains",
  "$base\(app)\settings\billing",
  "$base\(app)\settings\profile",
  "$base\(app)\settings\security",
  "$base\(app)\settings\alerts",
  "$base\(app)\settings\webhooks",
  "$base\(app)\settings\notifications",
  "$base\(app)\tools\utm-builder",
  "$base\(admin)\admin",
  "$base\(admin)\admin\users",
  "$base\(admin)\admin\users\[id]",
  "$base\(admin)\admin\plans",
  "$base\(admin)\admin\subscriptions",
  "$base\(admin)\admin\payments",
  "$base\(admin)\admin\domains",
  "$base\(admin)\admin\audit-log",
  "$base\(admin)\admin\theme",
  "$base\(admin)\admin\horizon"
)
foreach ($d in $dirs) {
  New-Item -ItemType Directory -Force $d | Out-Null
}
Write-Host "Done"
