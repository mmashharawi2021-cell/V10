/**
 * @file users.js
 * @description Local database for user authentication and access control.
 * Rules:
 * - 'admin' role: Sees everything, has access to Edit Mode.
 * - 'viewer' role: Sees only their assigned governorate, Edit Mode is hidden.
 */

export const users = [
  {
    username: "ibrahim",
    password: "123", // You can change this
    fullName: "إبراهيم الجملة (أبو كريم)",
    role: "admin",
    governorate: "all"
  },
  {
    username: "ebahtity",
    password: "123",
    fullName: "م. إيهاب البحتيطي",
    role: "viewer",
    governorate: ["غزة", "شمال غزة"]
  },
  {
    username: "neholy",
    password: "123",
    fullName: "م. نهاد الحولي",
    role: "viewer",
    governorate: "شمال غزة"
  },
  {
    username: "ahamad",
    password: "123",
    fullName: "م. عبدالمجيد حمد",
    role: "viewer",
    governorate: "غزة"
  },
  {
    username: "mjarad",
    password: "123",
    fullName: "م. محمود أبو جراد",
    role: "viewer",
    governorate: "غزة"
  },
  {
    username: "jalkass",
    password: "123",
    fullName: "م. جمال أبو الكاس",
    role: "viewer",
    governorate: ["غزة", "شمال غزة"]
  },
  {
    username: "ehouda",
    password: "123",
    fullName: "م. إيهاب أبو عودة",
    role: "viewer",
    governorate: ["غزة", "شمال غزة"]
  }
];
