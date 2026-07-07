<?php
/**
 * Plugin Name:       EYE Analytics
 * Plugin URI:        https://eye-analsyis.live
 * Description:       Privacy-first, cookieless website analytics. Paste your site token once and EYE tracks visitors, heatmaps, and conversions — no code, no cookie banner.
 * Version:           1.0.0
 * Author:            EYE Analytics
 * Author URI:        https://eye-analsyis.live
 * License:           GPL-2.0+
 * Text Domain:       eye-analytics
 */

if (!defined('ABSPATH')) {
    exit; // No direct access.
}

define('EYE_ANALYTICS_HOST', 'https://eye-analsyis.live');
define('EYE_ANALYTICS_OPTION', 'eye_analytics_token');

/* ── Settings page (Settings → EYE Analytics) ─────────────────────────────── */

add_action('admin_menu', function () {
    add_options_page(
        'EYE Analytics',
        'EYE Analytics',
        'manage_options',
        'eye-analytics',
        'eye_analytics_settings_page'
    );
});

add_action('admin_init', function () {
    register_setting('eye_analytics', EYE_ANALYTICS_OPTION, [
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default' => '',
    ]);
});

function eye_analytics_settings_page()
{
    $token = get_option(EYE_ANALYTICS_OPTION, '');
    ?>
    <div class="wrap">
        <h1>EYE Analytics</h1>
        <p>Paste your <strong>site token</strong> (from your EYE dashboard →
            <em>Settings → Domains</em>). That's it — tracking turns on across your whole site.</p>
        <form method="post" action="options.php">
            <?php settings_fields('eye_analytics'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="eye_token">Site token</label></th>
                    <td>
                        <input name="<?php echo esc_attr(EYE_ANALYTICS_OPTION); ?>" id="eye_token" type="text"
                               value="<?php echo esc_attr($token); ?>" class="regular-text" placeholder="e.g. a1b2c3d4..." />
                        <p class="description">Find it in your EYE dashboard next to your website.</p>
                    </td>
                </tr>
            </table>
            <?php submit_button('Save token'); ?>
        </form>
        <?php if (!empty($token)) : ?>
            <p style="color:#118a4e;font-weight:600;">✓ EYE is active on this site. Open your EYE dashboard —
                it lights up the moment the first visitor arrives.</p>
        <?php endif; ?>
    </div>
    <?php
}

/* ── Inject the tracker on every front-end page ───────────────────────────── */

add_action('wp_head', function () {
    if (is_admin()) {
        return;
    }
    $token = get_option(EYE_ANALYTICS_OPTION, '');
    if (empty($token)) {
        return;
    }
    printf(
        '<script src="%1$s/tracker/eye.js" data-token="%2$s" data-api="%1$s/api/collect" async></script>' . "\n",
        esc_url(EYE_ANALYTICS_HOST),
        esc_attr($token)
    );
}, 1);

/* ── Handy "Settings" link on the Plugins list ────────────────────────────── */

add_filter('plugin_action_links_' . plugin_basename(__FILE__), function ($links) {
    $url = admin_url('options-general.php?page=eye-analytics');
    array_unshift($links, '<a href="' . esc_url($url) . '">Settings</a>');
    return $links;
});
