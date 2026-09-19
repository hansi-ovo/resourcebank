# prompt
<font style="color:rgb(22, 22, 22);">我要给昆山杜克大学做一个resource bank网站，具体需求都在markdown附件里。网站风格设计要求简约，提取昆山杜克大学的主题色（绿色蓝色）作为网站的颜色亮点，但是饱和度不要太强，可以对原本的绿色蓝色进行一些风格处理，但要保证主题色是这个颜色。</font>

<font style="color:rgb(22, 22, 22);">运用react-bits的动效库。动效相关的名称或者描述，我会在resourcebank.md中用加粗和下划线表示。</font>



所有页面均为**英文**

所有页面的左上角都必须有这个logo：

<!-- 这是一张图片，ocr 内容为： -->
![](https://cdn.nlark.com/yuque/0/2026/png/29776688/1789400907255-89c6af0b-9226-46a6-aeef-73200c3d167c.png)

# 管理端
## 首页
| 功能名称 | 功能详情 | 动效 |
| --- | --- | --- |
| 标题 | 大字”Hi，管理员：）“，在页面上方 | |
| 搜索 | + 长条搜索框，右下角发送图标<br/>+ 搜索框下方选择搜索范围（内置标签供用户选择），初始时默认【All】<br/>+ 搜索范围：All、On-Campus Opportunities、Fellowship、Experimental Programs、Event&Conference、Training Programs<br/>+ 搜索时，发送图标变为加载动画，显示小字”请等待几分钟噢“搜索时，不影响其他功能的使用。<br/>+ 显示最近一次搜索的时间：月/日/年 24小时制时间<br/>+ 搜索结果处理：每次搜索返回质量最高的30条结果（项目网址与已有内容不重复）。总结每一个网址中信息，包含项目名称、简介、适用人群、项目开始/截止时间（如有），返回的结果加入审核列表。 | |
| 审核、更新表 | + 小字“您有x条内容待审核，x条网站未查看更新”首页显示数据与审核页数据相同。<br/>+ 小字下方为列表形式，显示最多5条待审核网站。每行表格显示内容：序号、项目名称、网址、标签<br/>+ 按钮“前往审核”和一个右箭头图标，点击跳转到审核页 | |
| 进入用户端按钮 | 点击跳转到用户端首页 | |


## 审核页
页面布局：

页面最上方留一窄条空白，有返回键，点击可以返回管理端首页

左侧为目录：审核列表、检查更新、内容管理。

右侧为列表：与目录相对应

| 功能名称 | 功能详情 | 动效 |
| --- | --- | --- |
| 审核列表 | + 列表形式：每一行包括项目名称、项目简介、网址、适用人群（如本科生/研究生/在美学习/...）、开始/截止时间、分类标签、审核状态。<br/>+ 项目名称、项目简介、网址、适用人群栏支持鼠标右键修改文字<br/>+ 分类标签支持进行替换（管理员从On-Campus Opportunities、Fellowship、Experimental Programs、Event&Conference、Training Programs中进行选择）<br/>+ 审核状态展示为两个图标×（移除）和√（通过），选择√的内容从审核列表中移除，添加到【内容管理】页面；选择×的内容直接移除。<br/>+ 表格上方：多选按钮，支持多选的内容一键移除/一键通过功能。 | **<u>移除和通过按钮用Fuse Button，要求有撤回操作功能</u>** |
| 检查更新 | + 列表形式：同【审核列表】<br/>+ 每周一检查【内容管理】页面中所有网站的内容是否有更新。如有：总结变更内容（如新的开始/截止时间），将更新的网站添加至【检查更新】（但不从【内容管理】中移除，也不改变【内容管理】中网站的原来描述）。<br/>+ 管理员通过×√按钮决定是否将变更信息同步到【内容管理】里 | |
| 内容管理 | + 列表形式：每一行包括项目名称、项目简介、网址、适用人群、开始/截止时间、分类标签、“撤回”按钮。<br/>+ 管理员点击“撤回”按钮，将该内容从【内容管理】中删除。<br/>+ 【内容管理】中的信息将自动上传到展示端网页 | |




# 展示端


## 首页
标题： DKU Leadership Resource Bank

副标题：Discover Opportunities Beyond the Classroom

描述：

Leadership development does not happen in a single program—it happens through a series of experiences.

This Resource Bank is curated by DKU Leadership Programs to help students discover high-quality opportunities inside and outside Duke Kunshan University, including Fellowships, Event, Conference, and other developmental experiences.

按钮：Get started！

**<u>动效：</u>**

**<u>网页右侧为滚轮展示效果，滚动展示On-Campus Opportunities、Fellowship、Experimental Programs、Event&Conference、Training Programs标签，每个标签下可以有图或项目名称，你自己定；</u>**

**<u>点击Get Started！按钮，有开屏动画，要求视觉冲击力强，丝滑切换到内容页；</u>**

**<u>标题的样式用react bits的Blur Text，副标题和描述部分渐进特效，重点单词要有颜色字体大小的区分；全部单词显示完毕后，鼠标移动要有variable proximity的效果。</u>**



## 内容页
完全滚动式网页，从上往下滑按照On-Campus Opportunities、Fellowship、Experimental Programs、Event&Conference、Training Programs标签依次排序，每个标签下展示**与管理端【内容管理】同步**的内容。



网站版面为（示例）：

向左对齐的标题（标签1）

card1、card2、card3...

向左对齐的标题（标签2）

card4、card5、card6...

......

网页右侧为可自由展开/折叠的目录：**<u>折叠时UI仅为几条短横线（代表有几个分类标签），光标移动到该区域展开标题，点击对应标题就跳到网站相应分类栏下。</u>**

每个card包含的内容：项目名称、适用人群、图片（最好直接调取原网站项目描述图片，如难实现就删除这项）

点击Card跳出大弹窗，弹窗内容包括：项目名称、项目简介、网址、适用人群、开始/截止时间、项目图片（一张）。点击右上角“×”按钮或者弹窗外的空白处可以关闭弹窗。

**<u>动效：card为网格状，鼠标移动有放大、阴影等特效；光标移动到按钮上也要有特效；向下滑动页面的时候，要有简约的滑动特效</u>**

# 产品逻辑
1. AI根据提示词进行全网搜索，将输出内容上传至管理端【审核页】
2. 管理员在【审核页】进行操作，审核通过的内容进入【内容管理】
3. 【内容管理】中信息按照card格式实时同步到展示端网页上
4. 运营中，AI对【内容管理】中网址内容定期检查信息是否变更





