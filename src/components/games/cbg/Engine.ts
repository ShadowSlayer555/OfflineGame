import { CardDef, CBG_CARDS } from './cards';

const MAP_W = 400;
const MAP_H = 600;

export interface Entity {
  id: string;
  type: 'tower' | 'troop' | 'spell';
  team: number; // 0 = host/bottom, 1 = guest/top
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  range: number;
  speed: number;
  color: string;
  targetId?: string;
  attackCooldown: number;
  radius: number;
  cardId?: string; // which card spawned it
  towerType?: 'king' | 'archer';
}

export interface Projectile {
  id: string;
  type: 'arrow' | 'cannonball' | 'spell_anim' | 'champion_magic';
  team: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  damage: number;
  targetId?: string;
  radius?: number;
  maxRadius?: number;
  color: string;
  trail?: { x: number, y: number }[];
  visualStyle?: 'lightning' | 'fireball' | 'portal';
}

export interface GameState {
  entities: Entity[];
  projectiles: Projectile[];
  elixir: [number, number]; // [host, guest]
  gameOver: boolean;
  winner: number | null;
}

const TOWER_HP = { king: 400, archer: 200 };

export class CBGEngine {
  state: GameState;
  
  constructor() {
    this.state = {
      entities: [],
      projectiles: [],
      elixir: [5, 5],
      gameOver: false,
      winner: null
    };
    this.initTowers();
  }

  initTowers() {
    // Host Towers (team 0)
    this.spawnTower(0, 200, 550, 'king', TOWER_HP.king);
    this.spawnTower(0, 100, 450, 'archer', TOWER_HP.archer);
    this.spawnTower(0, 300, 450, 'archer', TOWER_HP.archer);
    // Guest Towers (team 1)
    this.spawnTower(1, 200, 50, 'king', TOWER_HP.king);
    this.spawnTower(1, 100, 150, 'archer', TOWER_HP.archer);
    this.spawnTower(1, 300, 150, 'archer', TOWER_HP.archer);
  }

  spawnTower(team: number, x: number, y: number, typeStr: 'king' | 'archer', hp: number) {
    this.state.entities.push({
      id: `tower_${team}_${typeStr}_${Date.now()}_${Math.random()}`,
      type: 'tower',
      team, x, y, hp, maxHp: hp,
      damage: typeStr === 'king' ? 60 : 15, // King high dmg, low dps; Archer low dmg
      range: typeStr === 'king' ? 140 : 120, 
      speed: 0,
      color: team === 0 ? '#3b82f6' : '#ef4444',
      attackCooldown: 0,
      radius: typeStr === 'king' ? 25 : 20,
      towerType: typeStr
    });
  }

  update(dt: number) {
    if (this.state.gameOver) return;

    // Elixir
    this.state.elixir[0] = Math.min(10, this.state.elixir[0] + dt * 0.35);
    this.state.elixir[1] = Math.min(10, this.state.elixir[1] + dt * 0.35);

    // Towers and Troops
    for (const e of this.state.entities) {
      if (e.hp <= 0) continue;

      if (e.attackCooldown > 0) e.attackCooldown -= dt;

      // Find target
      let target = this.state.entities.find(t => t.id === e.targetId);
      if (!target || target.hp <= 0 || this.dist(e, target) > (e.range + (e.type === 'tower'? 20 : 100))) {
        e.targetId = undefined;
        // Find new target
        let closestDist = Infinity;
        let closestE = null;
        for (const t of this.state.entities) {
          if (t.team !== e.team && t.hp > 0) {
            const d = this.dist(e, t);
            if (d < closestDist) {
              closestDist = d;
              closestE = t;
            }
          }
        }
        if (closestE) {
          e.targetId = closestE.id;
          target = closestE;
        }
      }

      if (target) {
        const d = this.dist(e, target);
        if (d <= e.range + e.radius + target.radius) {
          // Attack
          if (e.attackCooldown <= 0) {
            let cooldown = 1.0;
            if (e.type === 'tower') {
                if (e.towerType === 'king') {
                   cooldown = 2.5; // low dps
                   this.state.projectiles.push({
                      id: `proj_${Date.now()}_${Math.random()}`,
                      type: 'cannonball', team: e.team,
                      x: e.x, y: e.y, tx: target.x, ty: target.y,
                      speed: 200, damage: e.damage,
                      targetId: target.id, color: '#0f172a' // black cannonball
                   });
                } else {
                   cooldown = 1.0; // archer 
                   this.state.projectiles.push({
                      id: `proj_${Date.now()}_${Math.random()}`,
                      type: 'arrow', team: e.team,
                      x: e.x, y: e.y, tx: target.x, ty: target.y,
                      speed: 300, damage: e.damage,
                      targetId: target.id, color: '#f8fafc' // white arrow
                   });
                }
            } else {
                if (e.damage < 0) { // healer
                  target.hp = Math.min(target.maxHp, target.hp - e.damage);
                } else if (e.cardId?.startsWith('ch')) {
                   // Champion attacks
                   let visualStyle: 'lightning' | 'fireball' | 'portal' = 'lightning';
                   if (e.cardId === 'ch2') visualStyle = 'fireball';
                   else if (e.cardId === 'ch3') visualStyle = 'portal';

                   this.state.projectiles.push({
                      id: `proj_${Date.now()}_${Math.random()}`,
                      type: 'champion_magic', team: e.team,
                      x: e.x, y: e.y, tx: target.x, ty: target.y,
                      speed: visualStyle === 'portal' ? 400 : 250, damage: e.damage,
                      targetId: target.id, color: e.color,
                      trail: [], visualStyle
                   });
                } else if (e.range > 30) {
                   // Regular ranged attacks
                   this.state.projectiles.push({
                      id: `proj_${Date.now()}_${Math.random()}`,
                      type: 'arrow', team: e.team,
                      x: e.x, y: e.y, tx: target.x, ty: target.y,
                      speed: 300, damage: e.damage,
                      targetId: target.id, color: '#f8fafc' // white arrow
                   });
                } else {
                   // Melee attack directly applies damage
                  target.hp -= e.damage;
                }
            }
            e.attackCooldown = cooldown;
          }
        } else if (e.type === 'troop') {
          // Move towards target
          // Simple pathing: move to bridge first if crossed moat
          let tx = target.x;
          let ty = target.y;

          const isTopSide = e.y < 300;
          const targetIsTopSide = target.y < 300;

          if (isTopSide !== targetIsTopSide) {
             // cross moat
             const distLeftBridge = Math.abs(e.x - 100);
             const distRightBridge = Math.abs(e.x - 300);
             const bridgeX = distLeftBridge < distRightBridge ? 100 : 300;
             tx = bridgeX;
             ty = isTopSide ? 320 : 280; // move past the midline
          }

          const angle = Math.atan2(ty - e.y, tx - e.x);
          e.x += Math.cos(angle) * e.speed * dt;
          e.y += Math.sin(angle) * e.speed * dt;
        }
      } else if (e.type === 'troop') {
         // Move to other side passively, considering bridges
         let tx = e.x;
         let ty = e.team === 0 ? 0 : 600;

         const isTopSide = e.y < 300;
         const targetIsTopSide = ty < 300;

         if (isTopSide !== targetIsTopSide) {
            const distLeftBridge = Math.abs(e.x - 100);
            const distRightBridge = Math.abs(e.x - 300);
            const bridgeX = distLeftBridge < distRightBridge ? 100 : 300;
            tx = bridgeX;
            ty = isTopSide ? 320 : 280;
         }

         const angle = Math.atan2(ty - e.y, tx - e.x);
         e.x += Math.cos(angle) * e.speed * dt;
         e.y += Math.sin(angle) * e.speed * dt;
      }
    }

    // Process spells/animations/projectiles
    for (let i = this.state.projectiles.length - 1; i >= 0; i--) {
       const p = this.state.projectiles[i];
       if (p.type === 'spell_anim') {
          if (p.radius !== undefined && p.maxRadius !== undefined) {
             p.radius += dt * 300; 
             if (p.radius >= p.maxRadius) {
                this.state.projectiles.splice(i, 1);
             }
          }
       } else {
          // move projectile towards target
          const angle = Math.atan2(p.ty - p.y, p.tx - p.x);
          p.x += Math.cos(angle) * p.speed * dt;
          p.y += Math.sin(angle) * p.speed * dt;
          
          if (p.trail) {
             p.trail.push({ x: p.x, y: p.y });
             if (p.trail.length > 5) p.trail.shift();
          }

          // hit detection
          if (this.dist({x: p.x, y: p.y}, {x: p.tx, y: p.ty}) < 15) {
             const hitE = this.state.entities.find(e => e.id === p.targetId && e.hp > 0);
             if (hitE) {
                hitE.hp -= p.damage;
             }
             this.state.projectiles.splice(i, 1);
          }
       }
    }

    // Filter dead
    this.state.entities = this.state.entities.filter(e => e.hp > 0);

    // Check win condition
    const hostKing = this.state.entities.find(e => e.type === 'tower' && e.team === 0 && e.radius === 25);
    const guestKing = this.state.entities.find(e => e.type === 'tower' && e.team === 1 && e.radius === 25);

    if (!hostKing) {
      this.state.gameOver = true;
      this.state.winner = 1;
    } else if (!guestKing) {
      this.state.gameOver = true;
      this.state.winner = 0;
    }
  }

  playCard(team: number, cardId: string, x: number, y: number) {
    const card = CBG_CARDS.find(c => c.id === cardId);
    if (!card) return;

    if (this.state.elixir[team] >= card.cost) {
      this.state.elixir[team] -= card.cost;
      
      if (card.type === 'spell') {
         // Instant effect
         for (const e of this.state.entities) {
            if (this.dist({x, y}, e as any) <= card.stats.radius!) {
               e.hp -= card.stats.damage!;
            }
         }
         this.state.projectiles.push({
            id: `anim_${Date.now()}_${Math.random()}`,
            type: 'spell_anim',
            team,
            x, y,
            tx: x, ty: y,
            speed: 0,
            damage: 0,
            radius: 0,
            maxRadius: card.stats.radius!,
            color: card.color
         });
      } else {
         const count = card.stats.count || 1;
         for (let i = 0; i < count; i++) {
           const ox = count > 1 ? (Math.random() - 0.5) * 20 : 0;
           const oy = count > 1 ? (Math.random() - 0.5) * 20 : 0;
           this.state.entities.push({
             id: `t_${Date.now()}_${Math.random()}`,
             type: 'troop',
             team,
             x: x + ox, y: y + oy,
             hp: card.stats.hp!, maxHp: card.stats.hp!,
             damage: card.stats.damage!,
             range: card.stats.range!,
             speed: card.stats.speed!,
             color: card.color,
             attackCooldown: 0,
             radius: 10,
             cardId
           });
         }
      }
    }
  }

  dist(a: {x: number, y: number}, b: {x: number, y: number}) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
