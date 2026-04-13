export function emailButton(text: string, url: string): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td align="center">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background:#F0B000;padding:0;">
            <a href="${url}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#000000;text-decoration:none;">${text}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

export function wrapEmailHtml(body: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>iCut</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#F4F4F4;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;">
  <!-- Preview text (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#F4F4F4;line-height:1px;">${previewText}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F4F4;padding:24px 0;">
    <tr>
      <td align="center">
        <!-- Container -->
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#161616;padding:20px 32px;">
              <a href="https://icut.pk" style="text-decoration:none;">
                <!--[if mso]>
                <span style="font-family:Arial,sans-serif;font-size:22px;font-weight:bold;color:#F0B000;">&#9986; iCut</span>
                <![endif]-->
                <!--[if !mso]><!-->
                <span style="font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:22px;font-weight:bold;color:#F0B000;">&#9986; iCut</span>
                <!--<![endif]-->
              </a>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#FFFFFF;padding:32px;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#161616;padding:20px 32px;">
              <p style="margin:0 0 6px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:13px;color:#EFEFEF;">Need help?</p>
              <p style="margin:0 0 10px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:13px;color:#EFEFEF;">
                <a href="https://wa.me/923001234567" style="color:#F0B000;text-decoration:none;font-weight:600;">WhatsApp</a>
                &nbsp;&nbsp;|&nbsp;&nbsp;
                <a href="mailto:support@icut.pk" style="color:#F0B000;text-decoration:none;font-weight:600;">support@icut.pk</a>
              </p>
              <p style="margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:11px;color:#EFEFEF;opacity:0.4;">&#169; 2026 iCut by Inparlor Technologies Pvt Ltd</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
