/* 节气行旅 · 四季平面探索版数据
 * 24 个节气 = 4 季 × 6 个习俗小游戏。所有画面由 Canvas / CSS 原创生成。
 */
window.JOURNEY_DATA = {
  version: 2,
  seasons: {
    spring: {
      id: 'spring', name: '春', title: '春之章 · 雨生', subtitle: '雨水落进新芽，纸鸢飞过田埂',
      color: '#4f9f5a', bright: '#8bd36f', pale: '#e9f8d8', ink: '#24542f',
      sky: '#dff6ef', ground: '#a9df77', path: '#f5df9d', water: '#86ddeb',
      weather: 'rain', weatherLabel: '细雨 · 花瓣', motto: '东风解冻，万物起始',
      start: { x: 920, y: 620 }, portal: { x: 1640, y: 720 },
      terms: ['lichun', 'yushui', 'jingzhe', 'chunfen', 'qingming', 'guyu']
    },
    summer: {
      id: 'summer', name: '夏', title: '夏之章 · 长明', subtitle: '烈日照见稻田，蝉声藏在树荫',
      color: '#dc8d26', bright: '#ffc84b', pale: '#fff0c4', ink: '#6b3b12',
      sky: '#c8f3ff', ground: '#7fd064', path: '#f0cc73', water: '#42c7df',
      weather: 'sun', weatherLabel: '烈日 · 蝉鸣', motto: '日高天远，草木并秀',
      start: { x: 920, y: 620 }, portal: { x: 1640, y: 720 },
      terms: ['lixia', 'xiaoman', 'mangzhong', 'xiazhi', 'xiaoshu', 'dashu']
    },
    autumn: {
      id: 'autumn', name: '秋', title: '秋之章 · 丰收', subtitle: '柿子染红山坡，河灯带走心愿',
      color: '#d17f2f', bright: '#f6bd55', pale: '#fff0cf', ink: '#653815',
      sky: '#fff0cf', ground: '#e8ba5d', path: '#d69343', water: '#72c8ca',
      weather: 'leaves', weatherLabel: '落叶 · 金风', motto: '金气初动，万物收成',
      start: { x: 920, y: 620 }, portal: { x: 1640, y: 720 },
      terms: ['liqiu', 'chushu', 'bailu', 'qiufen', 'hanlu', 'shuangjiang']
    },
    winter: {
      id: 'winter', name: '冬', title: '冬之章 · 瑞雪', subtitle: '雪落屋檐，灯火照亮归途',
      color: '#4c86ad', bright: '#8fd3e8', pale: '#eefbff', ink: '#23465d',
      sky: '#e9fbff', ground: '#f4fbfd', path: '#c6dce7', water: '#a9deed',
      weather: 'snow', weatherLabel: '大雪 · 冰晶', motto: '玄英闭藏，静待阳生',
      start: { x: 920, y: 620 }, portal: { x: 1640, y: 720 },
      terms: ['lidong', 'xiaoxue', 'daxue', 'dongzhi', 'xiaohan', 'dahan']
    }
  },
  terms: [
    {
      id: 'lichun', name: '立春', season: 'spring', glyph: '启', custom: '咬春', title: '春盘食材',
      position: { x: 320, y: 360 }, color: '#ef9aa8',
      culture: '部分地区有咬春、吃春饼和萝卜的习俗，用一口清新迎接春天。',
      game: {
        type: 'collect', title: '备一盘咬春', hint: '移动竹篮，接住春饼、萝卜和韭黄，避开石块与枯枝。',
        targets: [{ name: '春饼', glyph: '饼' }, { name: '萝卜', glyph: '萝' }, { name: '韭黄', glyph: '韭' }],
        avoid: [{ name: '石块', glyph: '石' }, { name: '枯枝', glyph: '枝' }], targetCount: 6
      }
    },
    {
      id: 'yushui', name: '雨水', season: 'spring', glyph: '润', custom: '占稻色', title: '稻色谷音',
      position: { x: 720, y: 250 }, color: '#78b8d1',
      culture: '部分地区有占稻色的旧俗，以稻谷爆开的形态寄托对收成的期盼。',
      game: {
        type: 'sequence', title: '复现稻色', hint: '记住谷粒亮起的顺序，再依次点回去。',
        symbols: [{ name: '稻壳', glyph: '壳' }, { name: '米粒', glyph: '米' }, { name: '谷花', glyph: '花' }, { name: '丰收', glyph: '丰' }],
        sequence: [0, 2, 1, 3, 2, 0]
      }
    },
    {
      id: 'jingzhe', name: '惊蛰', season: 'spring', glyph: '醒', custom: '蒙鼓皮', title: '春雷鼓点',
      position: { x: 1130, y: 340 }, color: '#a7c85a',
      culture: '惊蛰有蒙鼓皮等传统习俗，以鼓声象征春雷与万物苏醒。',
      game: {
        type: 'rhythm', title: '敲响春鼓', hint: '当节拍环收进鼓面时，点击画面或按空格击鼓。',
        instrument: '鼓', beats: 5, tempo: 1.15
      }
    },
    {
      id: 'chunfen', name: '春分', season: 'spring', glyph: '衡', custom: '竖蛋', title: '立蛋小戏',
      position: { x: 1490, y: 520 }, color: '#f0b34f',
      culture: '春分有竖蛋的趣味民俗，挑战重心与耐心，而不是所谓“引力异常”。',
      game: {
        type: 'timing', title: '春分立蛋', hint: '在游标进入绿色区域时点击或按空格，让鸡蛋站稳。',
        objectGlyph: '蛋', rounds: 5, timeLimit: 24
      }
    },
    {
      id: 'qingming', name: '清明', season: 'spring', glyph: '明', custom: '放纸鸢', title: '纸鸢穿柳',
      position: { x: 1100, y: 880 }, color: '#83c9a0',
      culture: '清明前后踏青、放风筝、插柳，是许多地方共有的春日习俗。',
      game: {
        type: 'assemble', title: '拼一只纸鸢', hint: '在 45 秒内依次装上纵向竹骨、横向竹骨、纸面、双飘带和线轴。', timeLimit: 45, pieces: [
          { name: '纵向竹骨', kind: 'spine' },
          { name: '横向竹骨', kind: 'spar' },
          { name: '菱形纸面', kind: 'sail' },
          { name: '左飘带', kind: 'ribbonLeft' },
          { name: '右飘带', kind: 'ribbonRight' },
          { name: '线轴', kind: 'spool' }
        ]
      }
    },
    {
      id: 'guyu', name: '谷雨', season: 'spring', glyph: '生', custom: '谷雨茶', title: '春末采茶',
      position: { x: 620, y: 970 }, color: '#65a777',
      culture: '谷雨前后采制的春茶被称为谷雨茶，部分地区还有赏牡丹等习俗。',
      game: {
        type: 'sort', title: '谷雨茶分拣', hint: '在 18 秒内把单芽、一芽一叶和杂质放入正确茶篓。', timeLimit: 18,
        categories: [{ name: '单芽', glyph: '芽' }, { name: '一芽一叶', glyph: '叶' }, { name: '杂质', glyph: '杂' }],
        items: [
          { name: '茶芽', glyph: '芽', cat: 0 }, { name: '嫩叶', glyph: '叶', cat: 1 },
          { name: '杂草', glyph: '草', cat: 2 }, { name: '一芽一叶', glyph: '茶', cat: 1 },
          { name: '老枝', glyph: '枝', cat: 2 }, { name: '单芽', glyph: '尖', cat: 0 }
        ]
      }
    },
    {
      id: 'lixia', name: '立夏', season: 'summer', glyph: '长', custom: '斗蛋', title: '蛋壳碰碰',
      position: { x: 300, y: 860 }, color: '#ef8b37',
      culture: '部分地区在立夏斗蛋、称人，用热闹的小游戏迎接夏日。',
      game: {
        type: 'duel', title: '来一场斗蛋', hint: '左右移动自己的蛋，瞄准对手后点击碰撞，赢下三回合。',
        objectGlyph: '蛋', rounds: 3
      }
    },
    {
      id: 'xiaoman', name: '小满', season: 'summer', glyph: '盈', custom: '祭车神', title: '车水灌田',
      position: { x: 520, y: 500 }, color: '#d7ad3d',
      culture: '小满前后农事繁忙，部分地区有祭车神、祈求灌溉顺利的习俗。',
      game: {
        type: 'pump', title: '稳住水车', hint: '左右交替踩踏，让水位保持在绿色区间累计 8 秒。',
        targetSeconds: 8
      }
    },
    {
      id: 'mangzhong', name: '芒种', season: 'summer', glyph: '忙', custom: '收种忙', title: '收麦插秧',
      position: { x: 900, y: 290 }, color: '#cf882e',
      culture: '芒种兼有收获与播种的农事节奏，各地还有送花神、煮梅等习俗。',
      game: {
        type: 'plant', title: '收麦插秧', hint: '在 32 秒内把稻秧、豆苗和玉米苗分别拖进对应的三块田垄。',
        slots: 9, timeLimit: 32, crops: [{ name: '稻秧' }, { name: '豆苗' }, { name: '玉米苗' }]
      }
    },
    {
      id: 'xiazhi', name: '夏至', season: 'summer', glyph: '极', custom: '夏至面', title: '一碗凉面',
      position: { x: 1280, y: 320 }, color: '#e66f29',
      culture: '“冬至饺子夏至面”是流传较广的节令饮食说法，部分地区夏至吃凉面。',
      game: {
        type: 'noodle', title: '做一碗夏至面', hint: '按住面头，沿碗中的虚线一路拖到尾，拉出完整面条。',
        points: 17
      }
    },
    {
      id: 'xiaoshu', name: '小暑', season: 'summer', glyph: '暑', custom: '晒书衣', title: '晒书晾衣',
      position: { x: 1510, y: 660 }, color: '#f4b33e',
      culture: '小暑前后有晒书、晒衣的习俗，利用盛夏阳光防潮防霉。',
      game: {
        type: 'weather', title: '晒书晾衣', hint: '看天空变化，在太阳和乌云之间快速选择晒或收。',
        rounds: 8, items: ['诗集', '长衫', '稻谷', '画册', '棉被', '豆子', '衣裳', '书箱']
      }
    },
    {
      id: 'dashu', name: '大暑', season: 'summer', glyph: '盛', custom: '送大暑船', title: '河上送福',
      position: { x: 1200, y: 990 }, color: '#dd5d27',
      culture: '浙江沿海部分地区有送大暑船的民俗，寄托祛暑纳福的愿望。',
      game: {
        type: 'path', title: '送大暑船', hint: '左右掌舵，收集三盏福灯，避开河石。',
        playerGlyph: '船', targetName: '福灯', targetGlyph: '灯', obstacleName: '河石', obstacleGlyph: '石', targetCount: 3
      }
    },
    {
      id: 'liqiu', name: '立秋', season: 'autumn', glyph: '收', custom: '晒秋', title: '七彩晒秋',
      position: { x: 300, y: 300 }, color: '#d99131',
      culture: '立秋前后，山区村落常把辣椒、玉米、南瓜等作物晾晒成缤纷的“晒秋”景观。',
      game: {
        type: 'hang', title: '把秋色晒开', hint: '在 28 秒内把九件红、黄作物分别挂到同色晒架。', timeLimit: 28,
        categories: [{ name: '红架', glyph: '红', cat: 0 }, { name: '黄架', glyph: '黄', cat: 1 }],
        items: [
          { name: '辣椒', glyph: '椒', cat: 0 }, { name: '玉米', glyph: '玉', cat: 1 },
          { name: '南瓜', glyph: '瓜', cat: 1 }, { name: '山楂', glyph: '楂', cat: 0 },
          { name: '稻谷', glyph: '稻', cat: 1 }, { name: '枸杞', glyph: '杞', cat: 0 },
          { name: '红椒', glyph: '椒', cat: 0 }, { name: '黄豆', glyph: '豆', cat: 1 },
          { name: '高粱', glyph: '粱', cat: 0 }
        ]
      }
    },
    {
      id: 'chushu', name: '处暑', season: 'autumn', glyph: '止', custom: '放河灯', title: '河灯远去',
      position: { x: 650, y: 280 }, color: '#cf7b37',
      culture: '处暑前后部分地区有放河灯、开渔等习俗，表达思念与祈愿。',
      game: {
        type: 'lantern', title: '放一盏河灯', hint: '点击左岸或右岸改变水流，推送河灯绕过礁石。',
        rocks: 4
      }
    },
    {
      id: 'bailu', name: '白露', season: 'autumn', glyph: '露', custom: '收清露', title: '收集晨露',
      position: { x: 1000, y: 440 }, color: '#899e78',
      culture: '部分地区有收清露、饮白露茶的习俗，表达对秋日清晨的珍惜。',
      game: {
        type: 'dew', title: '收一盅清露', hint: '在露珠消失前准确点入瓷盅，收满十二颗清露；空点会失误。',
        drops: 12, timeLimit: 24
      }
    },
    {
      id: 'qiufen', name: '秋分', season: 'autumn', glyph: '均', custom: '祭月', title: '月下供果',
      position: { x: 1390, y: 510 }, color: '#e0aa3f',
      culture: '秋分曾是传统“祭月节”，后来中秋节俗与秋季祭月传统相互交融。',
      game: {
        type: 'moon', title: '校准月下礼盘', hint: '三层礼盘会联动旋转；规划顺序，让三圈月纹同时对准上方刻度。',
        rings: 3, steps: 8
      }
    },
    {
      id: 'hanlu', name: '寒露', season: 'autumn', glyph: '寒', custom: '登高赏菊', title: '石阶菊香',
      position: { x: 1120, y: 880 }, color: '#b1803a',
      culture: '寒露与重阳时节相近，部分地区有登高、赏菊、饮菊花酒的习俗。',
      game: {
        type: 'climb', title: '踏阶登高', hint: '在 20 秒内从低到高点击十二块石阶，踏错会失误。',
        stones: 12, timeLimit: 20
      }
    },
    {
      id: 'shuangjiang', name: '霜降', season: 'autumn', glyph: '霜', custom: '摘柿子', title: '枝头红柿',
      position: { x: 650, y: 980 }, color: '#c86a2d',
      culture: '霜降前后，部分地区有吃柿子、赏菊、登高的习俗。',
      game: {
        type: 'shake', title: '摇落枝头红柿', hint: '在 28 秒内摇树，并移动竹篮接住五颗落下的柿子。',
        fruits: 6, targetFruits: 5, timeLimit: 28
      }
    },
    {
      id: 'lidong', name: '立冬', season: 'winter', glyph: '藏', custom: '包饺子', title: '围炉包饺',
      position: { x: 320, y: 430 }, color: '#5f91ae',
      culture: '立冬有补冬、吃饺子等习俗，北方不少地区把饺子作为节令食物。',
      game: {
        type: 'fold', title: '包一盘饺子', hint: '每只饺子先放馅、再折合、最后捏紧边缘；完成三只。', rounds: 3
      }
    },
    {
      id: 'xiaoxue', name: '小雪', season: 'winter', glyph: '雪', custom: '腌腊肉', title: '冬储风味',
      position: { x: 600, y: 250 }, color: '#71a7c0',
      culture: '小雪前后气温降低，部分地区开始腌腊肉、晒鱼干，为寒冬储备食物。',
      game: {
        type: 'salt', title: '给腊肉抹盐', hint: '按住盐罐移动，三条肉都要均匀覆盖；撒得过厚会失误。', strips: 3
      }
    },
    {
      id: 'daxue', name: '大雪', season: 'winter', glyph: '深', custom: '扫雪开路', title: '雪径归人',
      position: { x: 980, y: 300 }, color: '#4f87a7',
      culture: '大雪时节积雪加深，扫雪开路、赏雪、腌肉等习俗与冬日生活相连。',
      game: {
        type: 'wipe', title: '扫出一条归路', hint: '在 24 秒内拖动扫帚清除八处雪堆。', patches: 8, timeLimit: 24
      }
    },
    {
      id: 'dongzhi', name: '冬至', season: 'winter', glyph: '复', custom: '搓汤圆', title: '团圆甜汤',
      position: { x: 1450, y: 410 }, color: '#6aa3bd',
      culture: '冬至有吃饺子、汤圆等习俗，不同地区用各自的食物寄托团圆与迎冬。',
      game: {
        type: 'roll', title: '搓一碗汤圆', hint: '按住面团持续画圈，每颗至少转两圈半，搓出三颗汤圆。', rounds: 3, targetTurns: 2.4
      }
    },
    {
      id: 'xiaohan', name: '小寒', season: 'winter', glyph: '凛', custom: '腊八粥', title: '一碗暖粥',
      position: { x: 1220, y: 850 }, color: '#5b8ca6',
      culture: '小寒前后有吃腊八粥、探梅、备年货等习俗，用热粥温暖寒冬。',
      game: {
        type: 'pour', title: '配一碗腊八粥', hint: '在 16 秒内按米、豆、枣、果的顺序，把食材拖进粥锅。', timeLimit: 16,
        ingredients: [{ name: '米', glyph: '米' }, { name: '豆', glyph: '豆' }, { name: '枣', glyph: '枣' }, { name: '果', glyph: '果' }]
      }
    },
    {
      id: 'dahan', name: '大寒', season: 'winter', glyph: '终', custom: '除尘迎年', title: '扫尘纳新',
      position: { x: 700, y: 960 }, color: '#507e99',
      culture: '大寒临近春节，部分地区有除尘、备年货等习俗，以清爽环境迎接新年。',
      game: {
        type: 'sweep', title: '扫尘迎新年', hint: '在 22 秒内清理九处尘团，避开桌上的瓷器。', spots: 9, timeLimit: 22
      }
    }
  ]
};
