const nodemailer = require("nodemailer");
const asyncHandler = require('express-async-handler');


sendEmail = asyncHandler(async(data,req,res)=>{

    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          // TODO: replace `user` and `pass` values from <https://forwardemail.net>
          user: process.env.Mail_Id,
          pass: process.env.Mail_Password,
        },
      });
      
      // async..await is not allowed in global scope, must use a wrapper
      async function main() {
        let info = await transporter.sendMail({
          from: process.env.MAIL_ID, // sender address
          to: data.to, // list of receivers
          subject: data.subject, // Subject line
          text: data.text, // plain text body
          html: data.html, // Fix the typo here // html body
        });
    
        // Handle any further logic here...
        console.log("Email sent:", info.response);
      }
    
      // Additional logic for handling forgot password functionality can go here...
    
      // You can also call the main function to send an email when this middleware is invoked.
      await main(); 
      
})
;

module.exports = sendEmail