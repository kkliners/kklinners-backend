const nodemailer = require("nodemailer");
const asyncHandler = require("express-async-handler");

const sendEmail = asyncHandler(async (data, req, res) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.Mail_Id,
      pass: process.env.Mail_Password,
    },
  });

  // Define the styled HTML template
  const htmlTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    margin: 0;
                    padding: 0;
                    background-color: #f4f4f4;
                }
                .container {
                    max-width: 600px;
                    margin: 20px auto;
                    background: #ffffff;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .header {
                    background: #2c3e50;
                    color: #ffffff;
                    padding: 15px;
                    text-align: center;
                    border-radius: 8px 8px 0 0;
                }
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                }
                .content {
                    padding: 20px;
                }
                .footer {
                    text-align: center;
                    padding: 15px;
                    font-size: 12px;
                    color: #666;
                    border-top: 1px solid #eee;
                }
                .button {
                    display: inline-block;
                    padding: 10px 20px;
                    margin: 10px 0;
                    background: #3498db;
                    color: #ffffff;
                    text-decoration: none;
                    border-radius: 5px;
                }
                .button:hover {
                    background: #2980b9;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Klinner</h1>
                </div>
                <div class="content">
                    <p>Dear ${data.to},</p>
                    <p>${data.text}</p>
                    ${data.html ? data.html : ""}
                    <p>Best regards,</p>
                    <p>The Klinner Team</p>
                </div>
                <div class="footer">
                    <p>This email was sent by Klinner. Please do not reply directly to this email.</p>
                    <p>&copy; ${new Date().getFullYear()} Klinner. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;

  async function main() {
    let info = await transporter.sendMail({
      from: `"Klinner" <${process.env.Mail_Id}>`, // sender address
      to: data.to, // list of receivers
      subject: data.subject, // Subject line
      text: data.text, // plain text body
      html: htmlTemplate, // styled HTML body
    });

    console.log("Email sent:", info.response);
    return info;
  }

  const result = await main();
  return result;
});

module.exports = sendEmail;
