<?php
/**
 * Plugin Name:       EYE Analytics for WooCommerce
 * Plugin URI:        https://github.com/AhmedWael97/backend
 * Description:        Adds the EYE privacy-first analytics tracker to your store and reports every WooCommerce order to EYE so sales are attributed to the campaign that produced them.
 * Version:           1.0.0
 * Author:            EYE Analytics
 * License:           GPL-2.0-or-later
 * Text Domain:       eye-analytics
 * Requires at least: 5.6
 * Requires PHP:      7.4
 * WC requires at least: 5.0
 *
 * This plugin is intentionally a single file: it only needs a settings screen,
 * a tracker <script> injection, and one WooCommerce hook to report purchases.
 */

if (!defined('ABSPATH')) {
    exit; // No direct access.
}

define('EYE_WC_OPTION_GROUP', 'eye_analytics_options');

/* -------------------------------------------------------------------------
 * Options helpers
 * ---------------------------------------------------------------------- */

/**
 * Return the configured EYE base URL (no trailing slash), e.g.
 * https://app.your-eye-domain.com — both the tracker script and the
 * /api/track ingestion endpoint are derived from it.
 */
function eye_wc_base_url(): string
{
    return untrailingslashit(trim((string) get_option('eye_base_url', '')));
}

function eye_wc_token(): string
{
    return trim((string) get_option('eye_token', ''));
}

function eye_wc_tracker_src(): string
{
    $base = eye_wc_base_url();
    return $base ? $base . '/tracker/eye.js' : '';
}

function eye_wc_api_url(): string
{
    $base = eye_wc_base_url();
    return $base ? $base . '/api/track' : '';
}

/* -------------------------------------------------------------------------
 * Tracker injection — added to <head> on the front end of the store
 * ---------------------------------------------------------------------- */

add_action('wp_head', function () {
    if (is_admin()) {
        return;
    }
    if (!get_option('eye_inject_tracker', 1)) {
        return; // Merchant manages the snippet themselves.
    }
    $token = eye_wc_token();
    $src   = eye_wc_tracker_src();
    $api   = eye_wc_api_url();
    if ($token === '' || $src === '') {
        return; // Not configured yet.
    }

    $replay = get_option('eye_enable_replay', 0) ? ' data-replay="true"' : '';

    printf(
        '<script async src="%s" data-token="%s" data-api="%s"%s></script>' . "\n",
        esc_url($src),
        esc_attr($token),
        esc_url($api),
        $replay // safe: fixed literal, not user input
    );
}, 1);

/* -------------------------------------------------------------------------
 * Purchase reporting — fires EYE.purchase() on the order-received page
 * ---------------------------------------------------------------------- */

add_action('woocommerce_thankyou', function ($order_id) {
    if (!$order_id) {
        return;
    }
    if (!get_option('eye_track_purchases', 1)) {
        return;
    }
    if (eye_wc_token() === '') {
        return;
    }

    $order = wc_get_order($order_id);
    if (!$order) {
        return;
    }

    // Values reported to EYE.
    $value     = (float) $order->get_total();
    $currency  = (string) $order->get_currency();
    $order_ref = (string) $order->get_order_number();

    // The tracker loads async, so EYE.purchase may not exist yet when this
    // inline script runs. Poll briefly for it. A sessionStorage guard keyed
    // by the order reference prevents a page refresh from re-sending the sale
    // (EYE also de-dupes by order_id server-side as a backstop).
    ?>
    <script>
    (function () {
      var ORDER    = <?php echo wp_json_encode($order_ref); ?>;
      var VALUE    = <?php echo wp_json_encode($value); ?>;
      var CURRENCY = <?php echo wp_json_encode($currency); ?>;
      var guardKey = 'eye_purchase_' + ORDER;
      try { if (window.sessionStorage && sessionStorage.getItem(guardKey)) return; } catch (e) {}

      var tries = 0;
      (function fire() {
        if (window.EYE && typeof window.EYE.purchase === 'function') {
          window.EYE.purchase(VALUE, CURRENCY, ORDER);
          try { if (window.sessionStorage) sessionStorage.setItem(guardKey, '1'); } catch (e) {}
        } else if (tries++ < 50) {
          setTimeout(fire, 200); // up to ~10s waiting for the tracker
        }
      })();
    })();
    </script>
    <?php
});

/* -------------------------------------------------------------------------
 * Admin settings — Settings → EYE Analytics
 * ---------------------------------------------------------------------- */

add_action('admin_menu', function () {
    add_options_page(
        __('EYE Analytics', 'eye-analytics'),
        __('EYE Analytics', 'eye-analytics'),
        'manage_options',
        'eye-analytics',
        'eye_wc_render_settings_page'
    );
});

add_action('admin_init', function () {
    register_setting(EYE_WC_OPTION_GROUP, 'eye_base_url', [
        'type'              => 'string',
        'sanitize_callback' => 'esc_url_raw',
        'default'           => '',
    ]);
    register_setting(EYE_WC_OPTION_GROUP, 'eye_token', [
        'type'              => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default'           => '',
    ]);
    register_setting(EYE_WC_OPTION_GROUP, 'eye_inject_tracker', [
        'type'              => 'boolean',
        'sanitize_callback' => fn($v) => $v ? 1 : 0,
        'default'           => 1,
    ]);
    register_setting(EYE_WC_OPTION_GROUP, 'eye_track_purchases', [
        'type'              => 'boolean',
        'sanitize_callback' => fn($v) => $v ? 1 : 0,
        'default'           => 1,
    ]);
    register_setting(EYE_WC_OPTION_GROUP, 'eye_enable_replay', [
        'type'              => 'boolean',
        'sanitize_callback' => fn($v) => $v ? 1 : 0,
        'default'           => 0,
    ]);
});

function eye_wc_render_settings_page(): void
{
    if (!current_user_can('manage_options')) {
        return;
    }
    $configured = eye_wc_token() !== '' && eye_wc_base_url() !== '';
    ?>
    <div class="wrap">
        <h1><?php esc_html_e('EYE Analytics for WooCommerce', 'eye-analytics'); ?></h1>

        <?php if ($configured) : ?>
            <div class="notice notice-success inline"><p>
                <?php esc_html_e('Tracker active. Orders will be reported to EYE and attributed to their campaign.', 'eye-analytics'); ?>
            </p></div>
        <?php else : ?>
            <div class="notice notice-warning inline"><p>
                <?php esc_html_e('Enter your EYE base URL and tracking token to start tracking.', 'eye-analytics'); ?>
            </p></div>
        <?php endif; ?>

        <form method="post" action="options.php">
            <?php settings_fields(EYE_WC_OPTION_GROUP); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="eye_base_url"><?php esc_html_e('EYE API URL', 'eye-analytics'); ?></label></th>
                    <td>
                        <input name="eye_base_url" id="eye_base_url" type="url" class="regular-text"
                               value="<?php echo esc_attr(get_option('eye_base_url', '')); ?>"
                               placeholder="https://api.your-eye-domain.com" />
                        <p class="description"><?php esc_html_e('Your EYE backend/API URL (where the tracker is hosted), with no trailing slash. The tracker loads from /tracker/eye.js and events post to /api/track.', 'eye-analytics'); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="eye_token"><?php esc_html_e('Tracking Token', 'eye-analytics'); ?></label></th>
                    <td>
                        <input name="eye_token" id="eye_token" type="text" class="regular-text code"
                               value="<?php echo esc_attr(get_option('eye_token', '')); ?>"
                               placeholder="data-token from your EYE domain settings" />
                        <p class="description"><?php esc_html_e('Found under Domain → Install Script in your EYE dashboard.', 'eye-analytics'); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e('Inject tracker', 'eye-analytics'); ?></th>
                    <td>
                        <label>
                            <input name="eye_inject_tracker" type="checkbox" value="1" <?php checked(1, get_option('eye_inject_tracker', 1)); ?> />
                            <?php esc_html_e('Automatically add the EYE tracker to every store page.', 'eye-analytics'); ?>
                        </label>
                        <p class="description"><?php esc_html_e('Turn this off if you already install the tracker some other way (e.g. via your theme or a tag manager).', 'eye-analytics'); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e('Track purchases', 'eye-analytics'); ?></th>
                    <td>
                        <label>
                            <input name="eye_track_purchases" type="checkbox" value="1" <?php checked(1, get_option('eye_track_purchases', 1)); ?> />
                            <?php esc_html_e('Report each completed order to EYE for campaign revenue attribution.', 'eye-analytics'); ?>
                        </label>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e('Session replay', 'eye-analytics'); ?></th>
                    <td>
                        <label>
                            <input name="eye_enable_replay" type="checkbox" value="1" <?php checked(1, get_option('eye_enable_replay', 0)); ?> />
                            <?php esc_html_e('Record visitor sessions for replay (adds data-replay="true"). Requires "Inject tracker" to be on.', 'eye-analytics'); ?>
                        </label>
                        <p class="description"><?php esc_html_e('Use the eye-block / eye-mask CSS classes on sensitive elements to exclude them from recordings.', 'eye-analytics'); ?></p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}

/* -------------------------------------------------------------------------
 * Declare HPOS (High-Performance Order Storage) compatibility
 * ---------------------------------------------------------------------- */

add_action('before_woocommerce_init', function () {
    if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
            'custom_order_tables',
            __FILE__,
            true
        );
    }
});
