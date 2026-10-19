AQ V40 P3 双雷达观察测试版

基于用户已成功部署的P2源代码修改，保留腾讯行情代理与332只预设股票池。
新增：TOP3强势延续观察、午后冲板观察（不同筛选逻辑）、行情最新时间字段。
注意：没有扩展到全A股；无分时盘口与回测，不生成买入价格或可进信号。午后雷达只是候选池，不能作为涨停概率。
部署：替换仓库 worker.js、public/index.html、README.md，wrangler.toml可保持原样。Cloudflare自动部署后核对/api/health和/api/scan。
