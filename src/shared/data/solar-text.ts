/** Card text for each solar-system body (every body needs an entry). */
import type { I18n } from './types.ts';
import type { BodyId } from './solar.ts';

export const BODY_TEXT: Record<BodyId, { desc: I18n; funFact: I18n }> = {
  sun: {
    desc: { en: 'The Sun is our star: a gigantic ball of glowing hot gas at the centre of the Solar System. Its light and warmth make life on Earth possible. Never look straight at it!',
      zh: '太阳是我们的恒星，是太阳系中心一个巨大的炽热气体球。它的光和热让地球上的生命得以生存。千万不要直接盯着它看！' },
    funFact: { en: 'About 1.3 million Earths could fit inside the Sun!',
      zh: '太阳里面大约能装下 130 万个地球！' },
  },
  mercury: {
    desc: { en: 'Mercury is the smallest planet and the closest to the Sun. It has almost no air to hold heat, so its days are scorching and its nights are freezing.',
      zh: '水星是最小的行星，也是离太阳最近的行星。它几乎没有空气来保温，所以白天热得发烫，夜晚冷得结冰。' },
    funFact: { en: 'A year on Mercury lasts just 88 Earth days, but from one sunrise to the next takes 176 Earth days — longer than its year!',
      zh: '水星上一年只有 88 个地球日，可从一次日出到下一次日出却要 176 个地球日，比它的一年还长！' },
  },
  venus: {
    desc: { en: 'Venus is about the same size as Earth, but it is wrapped in thick clouds of acid that trap heat. It is the hottest planet — hot enough to melt lead.',
      zh: '金星和地球差不多大，但它裹着厚厚的酸性云层，把热量牢牢困住。它是最热的行星，热得能把铅熔化。' },
    funFact: { en: 'Venus spins backwards, so the Sun rises in the west — and one spin takes 243 Earth days, longer than its whole 225-day year!',
      zh: '金星是倒着转的，所以那里的太阳从西边升起；而且它自转一圈要 243 个地球日，比绕太阳一圈（225 天）还长！' },
  },
  earth: {
    desc: { en: 'Earth is our home — the only planet we know of with life. Liquid water covers about 71% of its surface, and its air keeps us warm and safe.',
      zh: '地球是我们的家园，也是我们所知唯一有生命的星球。约 71% 的表面被液态水覆盖，大气层让我们温暖又安全。' },
    funFact: { en: 'Earth races around the Sun at about 30 km every second — that\'s more than 100,000 km/h!',
      zh: '地球绕太阳飞奔的速度约为每秒 30 千米，一小时能跑 10 万多千米！' },
  },
  moon: {
    desc: { en: 'The Moon is Earth\'s only natural satellite. It always shows us the same face, and its dark patches are old plains of frozen lava. Twelve astronauts have walked on it.',
      zh: '月球是地球唯一的天然卫星。它总是用同一面对着我们，上面的暗斑是古老岩浆凝固成的平原。已经有 12 位宇航员在月球上行走过。' },
    funFact: { en: 'The Moon is slowly drifting away from Earth — about 3.8 cm every year, roughly as fast as your fingernails grow.',
      zh: '月球正在慢慢远离地球，每年大约远离 3.8 厘米，差不多和指甲长得一样快。' },
  },
  mars: {
    desc: { en: 'Mars is the Red Planet: its dust is full of rusty iron. It has the tallest volcano and one of the biggest canyons in the Solar System, and robot rovers are exploring it right now.',
      zh: '火星是一颗红色星球，因为它的尘土里有很多“生锈”的铁。这里有太阳系最高的火山和最大的峡谷之一，现在还有机器人火星车正在探索它。' },
    funFact: { en: 'On Mars the sky is reddish by day, but sunsets are blue!',
      zh: '火星上白天的天空是淡红色的，可日落时天空却是蓝色的！' },
  },
  ceres: {
    desc: { en: 'Ceres is the biggest object in the asteroid belt between Mars and Jupiter, and the only dwarf planet in the inner Solar System. The Dawn spacecraft orbited it from 2015 to 2018.',
      zh: '谷神星是火星和木星之间小行星带里最大的天体，也是太阳系内侧唯一的矮行星。“黎明号”探测器在 2015 到 2018 年间环绕它飞行。' },
    funFact: { en: 'Ceres was the very first asteroid ever discovered, on New Year\'s Day 1801.',
      zh: '谷神星是人类发现的第一颗小行星，发现日期正好是 1801 年的元旦！' },
  },
  jupiter: {
    desc: { en: 'Jupiter is the biggest planet — a giant ball of gas with colourful stripes of clouds. Its Great Red Spot is a storm bigger than Earth.',
      zh: '木星是最大的行星，一个缠着彩色云带的巨大气体球。它的大红斑是一个比地球还大的风暴。' },
    funFact: { en: 'More than 1,300 Earths could fit inside Jupiter, yet it spins so fast that a day there lasts less than 10 hours.',
      zh: '木星里能装下 1300 多个地球，可它转得飞快，一天还不到 10 个小时。' },
  },
  io: {
    desc: { en: 'Io is the most volcanic world in the Solar System, with hundreds of active volcanoes. Jupiter\'s gravity squeezes it like a stress ball, heating it up inside.',
      zh: '木卫一是太阳系火山最多的星球，有几百座活火山。木星的引力像捏解压球一样挤压它，让它的内部变得滚烫。' },
    funFact: { en: 'Its yellow and orange colours come from sulfur — and some of its volcanoes shoot plumes hundreds of kilometres into space!',
      zh: '它的黄色和橙色来自硫磺，有些火山能把喷发柱喷到几百千米高的太空中！' },
  },
  europa: {
    desc: { en: 'Europa is an icy moon covered in cracks. Under its ice shell hides a salty ocean — one of the best places to search for life beyond Earth.',
      zh: '木卫二是一颗布满裂纹的冰卫星。冰壳下面藏着一片咸咸的海洋，是在地球以外寻找生命的最佳地点之一。' },
    funFact: { en: 'Its hidden ocean may hold about twice as much water as all of Earth\'s oceans put together!',
      zh: '它隐藏的海洋里的水，可能是地球所有海洋加起来的两倍！' },
  },
  ganymede: {
    desc: { en: 'Ganymede is the biggest moon in the Solar System — even bigger than the planet Mercury. It is a mix of dark old ground and bright grooved ice.',
      zh: '木卫三是太阳系最大的卫星，比水星还大！它的表面有古老的暗色地区，也有布满沟纹的明亮冰原。' },
    funFact: { en: 'It is the only moon with its own magnetic field, so it even has its own auroras.',
      zh: '它是唯一拥有自己磁场的卫星，所以它也有自己的极光！' },
  },
  callisto: {
    desc: { en: 'Callisto is a dark, icy moon almost as big as Mercury. Its surface is very old and has hardly changed in about 4 billion years.',
      zh: '木卫四是一颗暗色的冰卫星，差不多和水星一样大。它的表面非常古老，大约 40 亿年来几乎没有变过。' },
    funFact: { en: 'It is one of the most heavily cratered places in the Solar System — craters on top of craters!',
      zh: '它是太阳系撞击坑最密集的地方之一，坑上面还叠着坑！' },
  },
  saturn: {
    desc: { en: 'Saturn is a giant gas planet famous for its beautiful rings made of ice. It has more known moons than any other planet.',
      zh: '土星是一颗巨大的气态行星，以它由冰块组成的美丽光环而闻名。它是已知卫星最多的行星。' },
    funFact: { en: 'Saturn is so light for its size that it would float in a bathtub — if you could find one big enough!',
      zh: '按体积来说土星非常轻，如果能找到一个足够大的浴缸，它能浮在水面上！' },
  },
  enceladus: {
    desc: { en: 'Enceladus is a small, snow-white moon of Saturn. Geysers at its south pole spray water from a hidden ocean out into space.',
      zh: '土卫二是土星的一颗雪白小卫星。它南极的喷泉把地下海洋里的水喷向太空。' },
    funFact: { en: 'It is one of the shiniest objects in the Solar System, reflecting almost all the sunlight that hits it.',
      zh: '它是太阳系最亮闪闪的天体之一，几乎能把照到它身上的阳光全部反射回去。' },
  },
  titan: {
    desc: { en: 'Titan is Saturn\'s biggest moon and the only moon with thick air. It has clouds, rain, rivers and seas — but they are made of liquid methane, not water.',
      zh: '土卫六是土星最大的卫星，也是唯一有浓厚大气的卫星。那里有云、有雨、有河也有海，不过都是液态甲烷，不是水。' },
    funFact: { en: 'With thick air and low gravity, you could fly on Titan just by flapping wings strapped to your arms!',
      zh: '土卫六空气浓、重力小，你只要在胳膊上绑一对翅膀扇一扇，就能飞起来！' },
  },
  uranus: {
    desc: { en: 'Uranus is an icy, blue-green giant that is tipped right over on its side, so it rolls around the Sun like a ball.',
      zh: '天王星是一颗蓝绿色的冰巨星，它几乎是“躺着”的，像一个球一样滚着绕太阳转。' },
    funFact: { en: 'Because of its tilt, each pole gets about 42 years of sunlight followed by 42 years of darkness.',
      zh: '因为它是躺着转的，每个极地都要先经历约 42 年的白天，再经历约 42 年的黑夜。' },
  },
  neptune: {
    desc: { en: 'Neptune is the farthest planet from the Sun — a deep-blue ice giant with the fastest winds in the Solar System.',
      zh: '海王星是离太阳最远的行星，一颗深蓝色的冰巨星，拥有太阳系最快的风。' },
    funFact: { en: 'Neptune was found using maths before anyone saw it. One Neptune year lasts 165 Earth years!',
      zh: '海王星是先用数学算出来、后来才被看到的。它的一年相当于 165 个地球年！' },
  },
  triton: {
    desc: { en: 'Triton is Neptune\'s biggest moon, and it orbits backwards. It was probably captured from the icy Kuiper Belt and has geysers of nitrogen.',
      zh: '海卫一是海王星最大的卫星，而且它是倒着绕行的。它很可能是从冰冷的柯伊伯带被“抓”来的，上面还有喷发氮气的喷泉。' },
    funFact: { en: 'Triton is one of the coldest places ever measured, about −235 °C.',
      zh: '海卫一是人类测量到的最冷的地方之一，大约零下 235 摄氏度。' },
  },
  pluto: {
    desc: { en: 'Pluto is a dwarf planet far out in the icy Kuiper Belt. In 2015 the New Horizons spacecraft flew past and found a giant heart-shaped glacier and mountains of ice.',
      zh: '冥王星是一颗位于遥远冰冷的柯伊伯带的矮行星。2015 年“新视野号”飞过它，发现了一个巨大的爱心形冰川和冰山。' },
    funFact: { en: 'One year on Pluto lasts 248 Earth years, so it hasn\'t finished a single orbit since it was discovered in 1930.',
      zh: '冥王星上一年等于 248 个地球年，所以从 1930 年被发现到现在，它连一圈都还没绕完！' },
  },
  charon: {
    desc: { en: 'Charon is Pluto\'s biggest moon — about half Pluto\'s size. The two always face each other as they spin around, like dancers holding hands.',
      zh: '冥卫一是冥王星最大的卫星，大小约为冥王星的一半。它们总是面对面地转圈，就像手拉手跳舞的舞伴。' },
    funFact: { en: 'Seen from one side of Pluto, Charon hangs in the same spot in the sky forever — it never rises or sets!',
      zh: '在冥王星的一侧看，冥卫一永远挂在天空同一个位置，从来不升起也不落下！' },
  },
  phobos: {
    desc: { en: 'Phobos is the bigger of Mars\'s two tiny moons — a lumpy, potato-shaped rock only about 22 km across, covered in grooves and dominated by the giant crater Stickney.',
      zh: '火卫一是火星两颗小卫星中较大的一颗，是一块只有约 22 公里宽、像土豆一样凹凸不平的石头，表面布满沟纹，还有一个巨大的斯蒂克尼陨石坑。' },
    funFact: { en: 'Phobos is slowly spiralling in towards Mars. In about 50 million years it will crash into Mars or break up into a ring!',
      zh: '火卫一正在一点点向火星靠近。大约 5000 万年后，它会撞上火星，或者碎成一圈光环！' },
  },
  deimos: {
    desc: { en: 'Deimos is Mars\'s smaller, outer moon: a smooth little rock about 12 km across, blanketed in fine dust. It may be a captured asteroid — or a piece of Mars from an ancient impact.',
      zh: '火卫二是火星较小、较远的卫星，是一块约 12 公里宽、覆盖着细尘的光滑小石头。它可能是被火星捕获的小行星，也可能是远古撞击时飞出去的火星碎片。' },
    funFact: { en: 'Deimos is so small that you could almost jump off it — its gravity is about 3,000 times weaker than Earth\'s.',
      zh: '火卫二太小了，你几乎可以一跳就飞走——它的引力比地球弱大约 3000 倍。' },
  },
  mimas: {
    desc: { en: 'Mimas is a small, icy moon of Saturn covered in craters. One crater, Herschel, is so big — about a third of Mimas\'s width — that it makes the moon look like the Death Star.',
      zh: '土卫一是土星一颗布满陨石坑的小冰卫星。其中赫歇尔陨石坑大得惊人，宽度约占整颗卫星的三分之一，让它看起来就像《星球大战》里的“死星”。' },
    funFact: { en: 'Mimas\'s gravity helps clear the Cassini Division, the big dark gap in Saturn\'s rings.',
      zh: '土卫一的引力帮忙“清扫”出了卡西尼环缝——土星光环中那道又宽又暗的缝隙。' },
  },
  tethys: {
    desc: { en: 'Tethys is a bright moon of Saturn made almost entirely of water ice. It has a huge crater, Odysseus, and a canyon, Ithaca Chasma, that stretches three-quarters of the way around it.',
      zh: '土卫三是土星一颗明亮的卫星，几乎全部由水冰构成。它有一个巨大的奥德修斯陨石坑，还有一条绕卫星四分之三圈的伊萨卡峡谷。' },
    funFact: { en: 'Tethys is so light for its size that it would float in a giant bathtub of water!',
      zh: '以它的大小来说，土卫三非常轻——如果有一个超大浴缸，它能浮在水面上！' },
  },
  dione: {
    desc: { en: 'Dione is an icy moon of Saturn. Its leading side is covered in craters, while its trailing side is crossed by bright "wispy" streaks — huge ice cliffs hundreds of metres tall.',
      zh: '土卫四是土星的一颗冰卫星。它朝前的一面布满陨石坑，朝后的一面则有许多明亮的“羽毛状”条纹——那其实是几百米高的巨大冰崖。' },
    funFact: { en: 'Dione shares its orbit with two tiny moons, Helene and Polydeuces, which travel ahead of and behind it.',
      zh: '土卫四和两颗小卫星——土卫十二和土卫三十四——共用同一条轨道，一个在前面、一个在后面跟着它跑。' },
  },
  rhea: {
    desc: { en: 'Rhea is Saturn\'s second-largest moon: a cold, bright ball of ice and rock, heavily cratered, with bright wispy cliffs on its trailing side and fresh rayed craters like Inktomi.',
      zh: '土卫五是土星第二大的卫星，是一个寒冷明亮的冰岩球，布满陨石坑。它朝后的一面也有明亮的羽毛状冰崖，还有像因克托米这样带着亮纹的新鲜陨石坑。' },
    funFact: { en: 'Inktomi crater is so bright and splashy that scientists nicknamed it "the Splat".',
      zh: '因克托米陨石坑又亮又像溅开的水花，科学家给它起了个外号叫“啪嗒”。' },
  },
  iapetus: {
    desc: { en: 'Iapetus is Saturn\'s two-faced moon: one half is as dark as coal, the other as bright as snow. A mountain ridge up to 20 km tall runs along its equator, like the seam of a walnut.',
      zh: '土卫八是土星的“双面”卫星：一半像煤一样黑，另一半像雪一样白。一条高达 20 公里的山脊沿着赤道延伸，就像核桃壳上的接缝。' },
    funFact: { en: 'In 1671 Giovanni Cassini could only see Iapetus on one side of Saturn — he correctly guessed that one half of it must be much darker!',
      zh: '1671 年，卡西尼发现土卫八只有在土星一侧时才看得见，他正确地猜到：这颗卫星有一半一定特别暗！' },
  },
  miranda: {
    desc: { en: 'Miranda is the smallest of Uranus\'s five big moons, and one of the strangest worlds known: a patchwork of grooved ovals, jumbled terrain and enormous cliffs, as if it were pieced together.',
      zh: '天卫五是天王星五颗大卫星中最小的一颗，也是已知最奇特的世界之一：表面像拼布一样，有带沟纹的椭圆区、杂乱的地形和巨大的悬崖，好像是被拼起来的。' },
    funFact: { en: 'Verona Rupes on Miranda may be the tallest cliff in the Solar System — about 20 km high. A rock dropped off the top would fall for over 10 minutes!',
      zh: '天卫五上的维罗纳断崖可能是太阳系最高的悬崖，高约 20 公里。从崖顶扔下一块石头，要掉 10 分钟以上才落地！' },
  },
  ariel: {
    desc: { en: 'Ariel is the brightest of Uranus\'s big moons, with a young icy surface split by long, flat-bottomed rift valleys where icy material once flowed.',
      zh: '天卫一是天王星大卫星中最明亮的一颗，年轻的冰面上裂开了许多又长又平底的裂谷，过去曾有冰物质在其中流动。' },
    funFact: { en: 'Ariel and Umbriel were both discovered on the same night in 1851 by William Lassell.',
      zh: '1851 年，威廉·拉塞尔在同一个晚上同时发现了天卫一和天卫二。' },
  },
  umbriel: {
    desc: { en: 'Umbriel is the darkest of Uranus\'s big moons — an old, crater-covered world. Near its equator sits Wunda crater, with a strange bright ring on its floor.',
      zh: '天卫二是天王星大卫星中最暗的一颗，是一个古老、布满陨石坑的世界。靠近赤道的温达陨石坑底部有一个奇怪的明亮圆环。' },
    funFact: { en: 'Scientists jokingly call Wunda\'s bright ring "the fluorescent Cheerio".',
      zh: '科学家开玩笑地把温达陨石坑的亮环叫作“发光的甜甜圈麦片”。' },
  },
  titania: {
    desc: { en: 'Titania is Uranus\'s largest moon. Its icy surface has craters and giant cracks, like Messina Chasmata, which stretches about 1,500 km — farther than from Beijing to Shanghai.',
      zh: '天卫三是天王星最大的卫星。它的冰面上有陨石坑，还有巨大的裂缝，比如长约 1500 公里的墨西拿峡谷——比北京到上海的距离还长。' },
    funFact: { en: 'Titania and Oberon were the first moons of Uranus ever found — by William Herschel in 1787, six years after he discovered Uranus itself.',
      zh: '天卫三和天卫四是最早被发现的天王星卫星，由威廉·赫歇尔在 1787 年发现，就在他发现天王星 6 年之后。' },
  },
  oberon: {
    desc: { en: 'Oberon is Uranus\'s outermost big moon: old, cratered and a little reddish. Some of its big craters, like Hamlet, have floors filled with mysterious dark material.',
      zh: '天卫四是天王星最外侧的大卫星，古老、布满陨石坑，还带点红色。它的一些大陨石坑，比如哈姆雷特坑，底部填满了神秘的暗色物质。' },
    funFact: { en: 'All of Uranus\'s big moons are named after characters from Shakespeare and Alexander Pope — Oberon is the fairy king in A Midsummer Night\'s Dream.',
      zh: '天王星的大卫星都以莎士比亚和蒲柏作品中的角色命名——奥伯龙是《仲夏夜之梦》里的仙王。' },
  },
  haumea: {
    desc: { en: 'Haumea is a dwarf planet beyond Neptune shaped like a squashed rugby ball. It spins so fast — once every 4 hours — that it has stretched itself out. It has two moons and even a ring!',
      zh: '妊神星是海王星外的一颗矮行星，形状像一个被压扁的橄榄球。它自转得非常快，大约 4 小时就转一圈，把自己甩成了长条形。它有两颗卫星，甚至还有一道光环！' },
    funFact: { en: 'Haumea is the fastest-spinning big object in the Solar System — a day there lasts less than 4 hours.',
      zh: '妊神星是太阳系中自转最快的大型天体——那里的一天还不到 4 小时。' },
  },
  makemake: {
    desc: { en: 'Makemake is a reddish dwarf planet in the Kuiper Belt, a bit smaller than Pluto. Its surface is covered in frozen methane, and it has one small dark moon.',
      zh: '鸟神星是柯伊伯带里一颗略带红色的矮行星，比冥王星小一点。它的表面覆盖着冻结的甲烷，还有一颗暗暗的小卫星。' },
    funFact: { en: 'It was discovered just after Easter in 2005, so its finders nicknamed it "Easterbunny"!',
      zh: '它是在 2005 年复活节后不久被发现的，所以发现者给它起了个外号叫“复活节兔子”！' },
  },
  eris: {
    desc: { en: 'Eris is a far-away dwarf planet almost the same size as Pluto but heavier. Its icy surface is one of the most reflective in the Solar System, as white as fresh snow.',
      zh: '阋神星是一颗非常遥远的矮行星，大小和冥王星差不多，但更重。它的冰面是太阳系中反光最强的表面之一，像新雪一样白。' },
    funFact: { en: 'Finding Eris in 2005 started the debate that led to Pluto being called a dwarf planet in 2006 — its name means "discord"!',
      zh: '2005 年阋神星的发现引发了一场大讨论，最终让冥王星在 2006 年被重新归为矮行星——它的名字就是“纷争女神”的意思！' },
  },
  amalthea: {
    desc: { en: 'Amalthea is a small, potato-shaped moon that races around Jupiter in just under 12 hours, closer in than Io. It is dark and very red, probably coated with sulphur dust blasted off Io\'s volcanoes.', zh: '木卫五是一颗土豆形状的小卫星，在木卫一的内侧绕木星飞奔，不到 12 小时就转一圈。它又暗又红，表面可能落满了从木卫一火山喷出来的硫磺尘埃。' },
    funFact: { en: 'It is the reddest object in the Solar System, and it gives off a little more heat than it gets from the Sun — Jupiter\'s warmth, light reflected off Jupiter and radiation all heat it up.', zh: '它是太阳系里最红的天体。它散发的热量比从太阳那里得到的还多一点——木星的热量、木星反射的阳光和辐射都在给它“加热”。' },
  },
  hyperion: {
    desc: { en: 'Hyperion is a lumpy moon of Saturn that looks like a giant sponge. Its ice is so full of holes that almost half of it is empty space, so meteorites punch deep pits instead of blasting material away.', zh: '土卫七是土星的一颗形状不规则的卫星，看起来像一块巨大的海绵。它的冰里布满孔洞，差不多一半是空的，所以陨石砸上去会戳出深坑，而不是把物质炸飞。' },
    funFact: { en: 'It tumbles chaotically: Titan\'s tugs keep changing its spin, so nobody can say which way it will be facing a few months from now!', zh: '它的自转是“混沌”的：土卫六的引力不断改变它的转动，所以没人能预测几个月后它会朝向哪一边！' },
  },
  phoebe: {
    desc: { en: 'Phoebe is a dark moon far out from Saturn that goes round backwards. It is probably a captured visitor from the outer Solar System, an icy body coated in dark dust.', zh: '土卫九是一颗离土星很远、倒着绕行的暗色卫星。它很可能是从太阳系外围被土星“捕获”的来客：一个裹着黑色尘埃的冰质天体。' },
    funFact: { en: 'Dust knocked off Phoebe forms a giant, almost invisible ring around Saturn — about 200 times as wide as the planet. Iapetus sweeps up this dust, which is why one side of it is dark.', zh: '从土卫九撞下来的尘埃在土星周围形成了一个几乎看不见的巨大环，宽度约是土星的 200 倍。土卫八“扫”到这些尘埃，所以它有一半是黑的。' },
  },
  proteus: {
    desc: { en: 'Proteus is Neptune\'s second-largest moon, a dark, boxy world about 420 km across. Even though it is bigger than Mimas, it was only found in 1989 because it is so dark and so close to Neptune\'s glare.', zh: '海卫八是海王星第二大的卫星，一个约 420 公里宽、又暗又方的天体。它比土卫一还大，却直到 1989 年才被发现，因为它太暗，又紧贴着明亮的海王星。' },
    funFact: { en: 'It is about as big as a body can get without its own gravity pulling it into a ball.', zh: '它差不多是一个天体在不被自身引力“捏”成球形的前提下能达到的最大尺寸。' },
  },
  nereid: {
    desc: { en: 'Nereid is a moon of Neptune on the most stretched-out orbit of any known moon. Over its 360-day year its distance from Neptune changes from about 1.4 million to 9.7 million km.', zh: '海卫二是海王星的一颗卫星，它的轨道是已知所有卫星里最扁长的。在它 360 天的一“年”里，它离海王星的距离会从约 140 万公里变化到约 970 万公里。' },
    funFact: { en: 'Its wild orbit suggests that when Neptune captured Triton, Triton\'s gravity flung Nereid out of place.', zh: '它这条“疯狂”的轨道说明：海王星捕获海卫一的时候，海卫一的引力可能把海卫二甩了出去。' },
  },
  nix: {
    desc: { en: 'Nix is one of Pluto\'s small moons, an icy body shaped like a jelly bean about 50 km long. New Horizons saw a reddish patch around one of its craters.', zh: '冥卫二是冥王星的小卫星之一，一个约 50 公里长、像软糖豆一样的冰质天体。“新视野号”在它的一个陨石坑周围看到了一块偏红的区域。' },
    funFact: { en: 'It is named after Nyx, the Greek goddess of night — the spelling was changed because an asteroid already had the name Nyx.', zh: '它以希腊神话中的夜之女神倪克斯命名，因为已经有一颗小行星叫 Nyx，所以把拼写改成了 Nix。' },
  },
  hydra: {
    desc: { en: 'Hydra is Pluto\'s outermost moon, a small chunk of very clean, bright water ice about 51 km long. It spins round in about 10 hours but takes 38 days to circle Pluto.', zh: '冥卫三是冥王星最外侧的卫星，一块约 51 公里长、非常干净明亮的水冰。它大约 10 小时自转一圈，绕冥王星一圈却要 38 天。' },
    funFact: { en: 'Its surface reflects more light than almost anything else in the Pluto system — as bright as fresh snow.', zh: '它表面的反光几乎是整个冥王星系统中最强的，像新雪一样亮。' },
  },
};
