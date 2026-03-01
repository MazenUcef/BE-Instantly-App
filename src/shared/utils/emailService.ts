import nodemailer from 'nodemailer';


// const transporter = nodemailer.createTransport({
//     host: 'smtp.sendgrid.net',
//     port: 587,
//     secure: false,
//     auth: {
//         user: 'apikey',
//         pass: process.env.SENDGRID_API_KEY
//     }
// });

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'mazenafifi1999@gmail.com',
    pass: 'ybcs slyz uawy flpm'
  }
});

export const sendResetPasswordEmail = async (email: string, resetToken: string) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
  console.log("resetToken", resetToken);

  const mailOptions = {
    from: process.env.FROM_USER,
    to: email,
    subject: 'Password Reset Request',
    html: `
      <h1>Password Reset Request</h1>
      <p>You requested to reset your password. Click the link below to reset it:</p>
      <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `
  }
  await transporter.sendMail(mailOptions)
}


export const sendPasswordChangedEmail = async (email: string) => {
  const mailOptions = {
    from: process.env.FROM_USER,
    to: email,
    subject: 'Password Changed Successfully',
    html: `
      <h1>Password Changed</h1>
      <p>Your password has been changed successfully.</p>
      <p>If you didn't make this change, please contact support immediately.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};


export const sendVerificationEmail = async (email: string, verificationToken: string) => {
  const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;
  console.log("sendVerificationEmail");
  console.log("email:", email);

  const mailOptions = {
    from: process.env.FROM_USER,
    to: email,
    subject: 'Verify Your Email Address',
    html: `
      <h1>Email Verification</h1>
      <p>Thank you for signing up! Please verify your email address by clicking the link below:</p>
      <a href="${verificationUrl}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't create an account, please ignore this email.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};


export const sendWelcomeEmail = async (email: string, firstName: string) => {
  const mailOptions = {
    from: process.env.FROM_USER,
    to: email,
    subject: 'Welcome to Instantly!',
    html: `
      <h1>Welcome, ${firstName}!</h1>
      <p>Your account has been successfully verified and you're now ready to use Instantly.</p>
      <p>Thank you for joining us!</p>
    `
  };

  await transporter.sendMail(mailOptions);
};



export const sendEmailOTP = async (email: string, otp: string) => {

  const mailOptions = {
    from: process.env.FROM_USER,
    to: email,
    subject: 'Email Verification Code',
    html: `
      <h2>Email Verification</h2>
      <p>Your verification code is:</p>
      <h1>${otp}</h1>
      <p>This code expires in 5 minutes.</p>
    `
  };
  await transporter.sendMail(mailOptions);

};