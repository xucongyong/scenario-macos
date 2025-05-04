---
title: Fogg motivation environment
date: 2024-02-29 20:43:40
tags: [Fogg,behavior,psychology]
---


# home

## 行为

* 打印(开)你[[like]]的书/工作，todo list.

## environment

* 爱好：打印(开)你[[like]]的书/工作，todo list.
* 味觉：准备好水
* 温度：22度
* 听觉：播放你喜欢的音乐
* 视觉：关闭网页
* 嗅觉：香薰
* 手：把笔记本放在桌子左边，键盘放在中前，笔和纸放在中间，键盘放在右边。
* 队友：[程序员共同学习](https://www.bilibili.com/video/BV1cg411S7jk/)


### 干扰物

* 零食放在门口
* 关闭推荐系统所有的东西
* 网页[[#chrome extension]]
* 本地游戏[[#crontab 在macos有启动bug]]

## 活动范围

小

# 户外

# Library

## 氛围

## 干扰物

没有

## 活动范围


# computer view

## chrome extension

* 屏蔽网页

* 屏蔽网页元素

* 屏蔽网页元素属性

* 屏蔽网页元素样式

* 拒绝干扰物

## crontab

使用crontab每天自动或自动删除

每天早上6-12点自动删除所有游戏脚本

```shell
crontab -e
*/10 5-15 * * * rm -rf /Users/xucongyong/Library/Application\ Support/Steam/
*/10 5-15 * * * rm -rf /Users/xucongyong/Applications/Dota\ 2.app
*/10 5-15 * * * rm -rf /Applications/Steam.app/
*/10 5-15 * * * rm -rf /Users/xucongyong/Downloads/steam*
```
### crontab 在macos有启动bug

解决方法：

进入“系统偏好设置”--安全性与隐私--完全磁盘访问权限，先解锁，然后将/usr/sbin/cron添加到右侧即可。