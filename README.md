# 🎓 English Class Booking System
### 英语课程预约系统

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-7c3aed?style=for-the-badge)](https://english-class-booking.onrender.com/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-≥18-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express)](https://expressjs.com/)

> **A modern, multilingual class booking system for English tutoring.**
> 一个现代化、多语言支持的英语课程预约系统。

[🌐 在线演示](https://english-class-booking.onrender.com/) · [✨ 功能特性](#-features) · [🚀 快速开始](#-quick-start) · [🛠 技术栈](#-tech-stack) · [📄 API 文档](#-api-endpoints)

---

## 📸 Screenshots / 界面展示

| 📅 Weekly Schedule | 👩‍🏫 Teacher View |
| :---: | :---: |
| ![Schedule](https://via.placeholder.com/400x250?text=Weekly+Schedule) | ![Admin](https://via.placeholder.com/400x250?text=Teacher+View) |
| *每周课程表* | *教师视图* |

---

## ✨ Features / 功能特性

### 🗓️ Schedule Management (课程管理)
* **Weekly View**: Color-coded 7-day schedule (10:00–19:00).
    * *彩色编码的7天课程表，支持 8 个固定时间段。*
* **Real-time Status**: Instant updates for 🟢 Available, 🟡 Booked, and 🔴 Not Available.
    * *实时状态更新：可选、已约、不可约。*
* **Week Navigation**: Easily browse past and future schedules.
    * *便捷的周次导航与日期显示。*

### 🔐 Authentication (安全认证)
* **4-Digit PIN**: Simple student login, no complex passwords needed.
    * *极简 4 位数字 PIN 码登录。*
* **Google OAuth**: One-click registration & login.
    * *支持 Google 账号一键登录。*
* **Session Security**: Secure cookie-based sessions (7-day expiry).
    * *基于 Cookie 的安全会话管理。*

### 🌍 i18n (多语言支持)
支持 **English**, **简体中文**, **ภาษาไทย**, **日本語** 四国语言，适配国际化教学场景。

---

## 🛠️ Tech Stack / 技术栈

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | HTML5, Vanilla CSS, JS (ES6+), Client-side i18n |
| **Backend** | Node.js (≥18), Express 4.x, bcryptjs |
| **Database** | SQLite via `sql.js` (Zero-dependency) |
| **Deployment** | Render.com (Auto-deploy via `render.yaml`) |

---

## 🚀 Quick Start / 快速开始

### Prerequisites
* **Node.js** ≥ 18.0.0
* **npm** (Node Package Manager)

### Installation
```bash
# 1. Clone the repo
git clone [https://github.com/zixiang2008/english-class-booking.git](https://github.com/zixiang2008/english-class-booking.git)
cd english-class-booking

# 2. Install dependencies
npm install

# 3. Spin up the server
npm start
