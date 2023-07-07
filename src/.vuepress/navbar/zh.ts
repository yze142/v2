import { navbar } from "vuepress-theme-hope";

export const zhNavbar = navbar([
  "/zh/",
  { text: "框架", icon: "Apache", link: "/zh/框架系列/"},
  { text: "数据库", icon: "delete", link: "/zh/database/"},
  { text: "编程语言", icon: "java", link: "/zh/programming/"},
  { text: "多线程", icon: "launch", link: "/zh/multithreading/"}
]);
