/* D-007 · verify.js 改前基线重建（审计对照用，不参与产品运行）
 *
 * 背景：本批对 verify.js 只有两处改动（A31 寄售按钮改为动态实收价，断言随之升级）。
 *       该文件不在 git 版本控制内，改前未单独冻结副本，故按这两处逐字反向替换，
 *       精确重建改前版本，供完整 diff / 基线哈希 / 独立审查使用。
 * 用法：node tools/d007_verify_baseline.mjs
 * 产出：js/D007_BACKUP_20261108_225456/verify.js（改前版本）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cur = fs.readFileSync(path.join(root, 'verify.js'), 'utf8');
let s = cur;

const steps = [
  {
    label: '采集点新增的 itemSellDyn 行',
    now: "    L('itemSellDyn', XX._sellPrice('mat_core'));   /* A31：冻结打开详情那一刻的动态价，供后面同源校验 */\n",
    was: ''
  },
  {
    label: '原第 4060 行断言',
    now: "  /* A31：寄售按钮改显示坊市实收价（sellPrice，随境界/行情浮动），不再写 ITEMS 的固定标价。\n" +
         "     断言同步升级为「与当时 _sellPrice 同源」的精确校验，而非硬编码 30。 */\n" +
         "  ok(Number((((F.itemSellTxt || '').match(/[\\d,]+/) || [''])[0]).replace(/,/g, '')) === Number(F.itemSellDyn),\n" +
         "     '寄售按钮显示坊市实收价（与 _sellPrice 同源）', F.itemSellTxt + ' / ' + F.itemSellDyn);",
    was: "  ok(/30/.test(F.itemSellTxt), '寄售按钮显示售价（' + F.itemSellTxt + '）');"
  }
];

for (const st of steps) {
  if (!s.includes(st.now)) throw new Error('重建失败，未找到改后片段：' + st.label);
  s = s.replace(st.now, st.was);
}

const out = path.join(root, 'js', 'D007_BACKUP_20261108_225456', 'verify.js');
fs.writeFileSync(out, s);
console.log('OK 改前基线重建 bytes=' + Buffer.byteLength(s) + ' -> ' + out);
