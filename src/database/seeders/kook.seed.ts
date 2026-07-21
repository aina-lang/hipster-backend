import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from 'src/data-source';
import { KookUser, KookUserType, KookPlan } from 'src/kook/entities/kook-user.entity';
import { RecipeCategory } from 'src/kook/entities/recipe-category.entity';
import { Recipe, RecipeDifficulty } from 'src/kook/entities/recipe.entity';
import { KookComment } from 'src/kook/entities/kook-comment.entity';
import { KookLike } from 'src/kook/entities/kook-like.entity';
import { Bookmark } from 'src/kook/entities/bookmark.entity';
import { Follow } from 'src/kook/entities/follow.entity';

async function seed() {
  const dataSource = await AppDataSource.initialize();
  console.log('✓ Database connected for Kook seed');

  const userRepo = dataSource.getRepository(KookUser);
  const categoryRepo = dataSource.getRepository(RecipeCategory);
  const recipeRepo = dataSource.getRepository(Recipe);
  const commentRepo = dataSource.getRepository(KookComment);
  const likeRepo = dataSource.getRepository(KookLike);
  const bookmarkRepo = dataSource.getRepository(Bookmark);
  const followRepo = dataSource.getRepository(Follow);

  const password = await bcrypt.hash('password123', 10);

  // ──────────────────────────────────────────────
  // 1. KOOK USERS
  // ──────────────────────────────────────────────
  const creator1 = userRepo.create({
    email: 'mioty@kook.mg',
    pseudo: 'Mioty R.',
    firstName: 'Mioty',
    lastName: 'Rakoto',
    password,
    userType: KookUserType.CREATOR,
    plan: KookPlan.PREMIUM,
    isEmailVerified: true,
    avatarUrl: 'https://picsum.photos/seed/mioty/200/200',
  });
  await userRepo.save(creator1);

  const creator2 = userRepo.create({
    email: 'sitraka@kook.mg',
    pseudo: 'Sitraka H.',
    firstName: 'Sitraka',
    lastName: 'Haja',
    password,
    userType: KookUserType.CREATOR,
    plan: KookPlan.FREE,
    isEmailVerified: true,
    avatarUrl: 'https://picsum.photos/seed/sitraka/200/200',
  });
  await userRepo.save(creator2);

  const creator3 = userRepo.create({
    email: 'fara@kook.mg',
    pseudo: 'Fara N.',
    firstName: 'Fara',
    lastName: 'Nirina',
    password,
    userType: KookUserType.CREATOR,
    plan: KookPlan.FREE,
    isEmailVerified: true,
    avatarUrl: 'https://picsum.photos/seed/fara/200/200',
  });
  await userRepo.save(creator3);

  const viewer1 = userRepo.create({
    email: 'viewer@kook.mg',
    pseudo: 'Fan de cuisine',
    firstName: 'Tovo',
    lastName: 'Mamy',
    password,
    userType: KookUserType.VIEWER,
    plan: KookPlan.FREE,
    isEmailVerified: true,
    avatarUrl: 'https://picsum.photos/seed/tovo/200/200',
  });
  await userRepo.save(viewer1);

  console.log('✓ Kook users created');

  // ──────────────────────────────────────────────
  // 2. CATEGORIES
  // ──────────────────────────────────────────────
  const categories = [
    { name: 'Entrée', slug: 'entree', description: 'Amuses-bouches et entrées' },
    { name: 'Plat principal', slug: 'plat-principal', description: 'Plats complets' },
    { name: 'Dessert', slug: 'dessert', description: 'Douceurs et desserts' },
    { name: 'Boisson', slug: 'boisson', description: 'Boissons et jus' },
    { name: 'Snack', slug: 'snack', description: 'Collations rapides' },
  ];

  const savedCategories: RecipeCategory[] = [];
  for (const cat of categories) {
    const saved = categoryRepo.create(cat);
    savedCategories.push(await categoryRepo.save(saved));
  }
  console.log('✓ Recipe categories created');

  // ──────────────────────────────────────────────
  // 3. RECIPES
  // ──────────────────────────────────────────────
  const recipes = [
    {
      title: 'Koba',
      description: 'Gâteau traditionnel malgache à base de farine de riz et de banane.',
      ingredients: ['Farine de riz', 'Banane', 'Sucre', 'Lait de coco', 'Vanille'],
      instructions: 'Mélanger la farine et le sucre. Ajouter la banane écrasée et le lait de coco. Cuire à la vapeur 45 min.',
      cookingTime: 60,
      difficulty: RecipeDifficulty.MOYEN,
      imageUrl: 'https://picsum.photos/seed/koba/800/600',
      category: savedCategories[2],
      creator: creator1,
      likesCount: 12,
    },
    {
      title: 'Romazava',
      description: 'Ragoût de viande traditionnel malgache avec des brèdes.',
      ingredients: ['Viande de zébu', 'Bœuf', 'Brèdes', 'Ail', 'Gingembre', 'Tomate'],
      instructions: 'Faire revenir la viande avec l\'ail et le gingembre. Ajouter les tomates et les brèdes. Laisser mijoter 1h.',
      cookingTime: 90,
      difficulty: RecipeDifficulty.DIFFICILE,
      imageUrl: 'https://picsum.photos/seed/romazava/800/600',
      category: savedCategories[1],
      creator: creator2,
      likesCount: 8,
    },
    {
      title: 'Mofo Akondro',
      description: 'Beignets à la banane croustillants et sucrés.',
      ingredients: ['Banane', 'Farine', 'Sucre', 'Œuf', 'Huile de friture'],
      instructions: 'Écraser les bananes, mélanger avec la farine, le sucre et l\'œuf. Former des boules et frire.',
      cookingTime: 30,
      difficulty: RecipeDifficulty.FACILE,
      imageUrl: 'https://picsum.photos/seed/mofo/800/600',
      category: savedCategories[2],
      creator: creator1,
      likesCount: 15,
    },
    {
      title: 'Ravitoto',
      description: 'Feuilles de manioc pilées avec du porc.',
      ingredients: ['Feuilles de manioc', 'Pork', 'Ail', 'Gingembre', 'Piment', 'Lait de coco'],
      instructions: 'Piler les feuilles de manioc. Faire revenir le porc, mélanger et cuire 2h à feu doux.',
      cookingTime: 150,
      difficulty: RecipeDifficulty.DIFFICILE,
      imageUrl: 'https://picsum.photos/seed/ravitoto/800/600',
      category: savedCategories[1],
      creator: creator3,
      likesCount: 6,
    },
    {
      title: 'Thon à la malgache',
      description: 'Thon frais mariné aux saveurs malgaches.',
      ingredients: ['Thon frais', 'Citron vert', 'Piment', 'Ail', 'Huile d\'olive'],
      instructions: 'Mariner le thon 30 min. Cuire 10 min à la poêle avec les épices.',
      cookingTime: 40,
      difficulty: RecipeDifficulty.FACILE,
      imageUrl: 'https://picsum.photos/seed/thon/800/600',
      category: savedCategories[0],
      creator: creator2,
      likesCount: 9,
    },
  ];

  const savedRecipes: Recipe[] = [];
  for (const r of recipes) {
    const recipe = recipeRepo.create(r);
    savedRecipes.push(await recipeRepo.save(recipe));
  }
  console.log('✓ Recipes created');

  // ──────────────────────────────────────────────
  // 4. LIKES
  // ──────────────────────────────────────────────
  await likeRepo.save(likeRepo.create({ user: creator1, recipe: savedRecipes[1] }));
  await likeRepo.save(likeRepo.create({ user: creator1, recipe: savedRecipes[2] }));
  await likeRepo.save(likeRepo.create({ user: creator2, recipe: savedRecipes[0] }));
  await likeRepo.save(likeRepo.create({ user: viewer1, recipe: savedRecipes[0] }));
  await likeRepo.save(likeRepo.create({ user: viewer1, recipe: savedRecipes[2] }));
  console.log('✓ Likes created');

  // ──────────────────────────────────────────────
  // 5. COMMENTS
  // ──────────────────────────────────────────────
  await commentRepo.save(commentRepo.create({
    author: viewer1,
    recipe: savedRecipes[0],
    text: 'Excellent koba ! Recette authentique.',
  }));
  await commentRepo.save(commentRepo.create({
    author: creator2,
    recipe: savedRecipes[0],
    text: 'Merci, je vais tester ce weekend !',
  }));
  await commentRepo.save(commentRepo.create({
    author: viewer1,
    recipe: savedRecipes[1],
    text: 'Le romazava est parfait avec du riz.',
  }));
  console.log('✓ Comments created');

  // ──────────────────────────────────────────────
  // 6. BOOKMARKS
  // ──────────────────────────────────────────────
  await bookmarkRepo.save(bookmarkRepo.create({ user: viewer1, recipe: savedRecipes[0] }));
  await bookmarkRepo.save(bookmarkRepo.create({ user: viewer1, recipe: savedRecipes[2] }));
  await bookmarkRepo.save(bookmarkRepo.create({ user: creator1, recipe: savedRecipes[1] }));
  console.log('✓ Bookmarks created');

  // ──────────────────────────────────────────────
  // 7. FOLLOWS
  // ──────────────────────────────────────────────
  await followRepo.save(followRepo.create({ follower: viewer1, following: creator1 }));
  await followRepo.save(followRepo.create({ follower: viewer1, following: creator2 }));
  await followRepo.save(followRepo.create({ follower: creator2, following: creator1 }));
  console.log('✓ Follows created');

  await dataSource.destroy();
  console.log('\n✓ Kook seed completed successfully!');
  console.log('\n── Test accounts ──');
  console.log('Creator 1: mioty@kook.mg / password123');
  console.log('Creator 2: sitraka@kook.mg / password123');
  console.log('Creator 3: fara@kook.mg / password123');
  console.log('Viewer:    viewer@kook.mg / password123');
}

seed().catch((err) => {
  console.error('Kook seed failed:', err);
  process.exit(1);
});
