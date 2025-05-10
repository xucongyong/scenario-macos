#!/bin/bash

# 获取当前日期和时间
current_datetime=$(date +'%Y-%m-%d %H-%M-%S')

# 添加所有更改
git add -A

# 提交更改并包含当前日期和时间
git commit -a -m "backup: $current_datetime"

# 继续 rebase
git rebase --continue

# 拉取最新更改
proxychains4 git pull

# 推送更改
proxychains4 git push

# 输出当前日期和时间
echo "Current date and time: $current_datetime"