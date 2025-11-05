#!/usr/bin/env python3
"""
Script to remove auto-added URLs from Telegram recipe messages

Usage:
    # Dry run (shows what will be changed without actually changing):
    python cleanup_recipe_urls.py --dry-run

    # Actually perform the cleanup:
    python cleanup_recipe_urls.py

    # With custom delay between updates (seconds):
    python cleanup_recipe_urls.py --delay 2
"""

import asyncio
import argparse
import sys
import os
import re
from datetime import datetime

# Add the parent directory to the path to import the app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ourRecipesBack import create_app
from ourRecipesBack.models.recipe import Recipe
from ourRecipesBack.services.telegram_service import telegram_service
from ourRecipesBack.extensions import db


class RecipeURLCleaner:
    def __init__(self, dry_run=True, delay=1.5):
        self.dry_run = dry_run
        self.delay = delay
        self.url_pattern = re.compile(r'\n\n🔗 קישור למתכון:.*$', re.MULTILINE)

        self.stats = {
            'total': 0,
            'with_url': 0,
            'cleaned': 0,
            'failed': 0,
            'skipped': 0
        }

    def has_auto_url(self, text):
        """Check if text contains the auto-added URL"""
        return '🔗 קישור למתכון:' in text

    def clean_url_from_text(self, text):
        """Remove the auto-added URL from text"""
        cleaned = self.url_pattern.sub('', text)
        return cleaned.strip()

    async def clean_recipe(self, recipe):
        """Clean a single recipe"""
        if not self.has_auto_url(recipe.raw_content):
            self.stats['skipped'] += 1
            return False

        self.stats['with_url'] += 1

        # Clean the text
        cleaned_text = self.clean_url_from_text(recipe.raw_content)

        print(f"\n{'='*80}")
        print(f"Recipe ID: {recipe.id} | Telegram ID: {recipe.telegram_id}")
        print(f"Title: {recipe.title}")
        print(f"\nORIGINAL (last 200 chars):")
        print(f"{recipe.raw_content[-200:]}")
        print(f"\nCLEANED (last 200 chars):")
        print(f"{cleaned_text[-200:]}")

        if self.dry_run:
            print(f"[DRY RUN] Would update this recipe")
            self.stats['cleaned'] += 1
            return True

        # Actually update Telegram and DB
        try:
            client = await telegram_service.get_client()
            async with client:
                channel_entity = await client.get_entity(
                    recipe._sa_instance_state.session.get_bind().app.config["CHANNEL_URL"]
                )

                # Edit the Telegram message
                await client.edit_message(
                    channel_entity,
                    recipe.telegram_id,
                    cleaned_text
                )

                # Update DB
                recipe.raw_content = cleaned_text
                recipe.title = recipe.raw_content.split("\n", 1)[0].strip("*:")
                db.session.commit()

                print(f"✅ Successfully cleaned recipe {recipe.id}")
                self.stats['cleaned'] += 1

                # Rate limiting delay
                await asyncio.sleep(self.delay)
                return True

        except Exception as e:
            print(f"❌ Failed to clean recipe {recipe.id}: {str(e)}")
            self.stats['failed'] += 1
            db.session.rollback()
            return False

    async def run(self):
        """Run the cleanup process"""
        print(f"\n{'='*80}")
        print(f"Recipe URL Cleanup Script")
        print(f"{'='*80}")
        print(f"Mode: {'DRY RUN' if self.dry_run else 'LIVE'}")
        print(f"Delay between updates: {self.delay}s")
        print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*80}\n")

        # Get all recipes
        recipes = Recipe.query.all()
        self.stats['total'] = len(recipes)

        print(f"Found {self.stats['total']} total recipes\n")

        # Process each recipe
        for i, recipe in enumerate(recipes, 1):
            print(f"\nProcessing recipe {i}/{self.stats['total']}...", end=' ')
            await self.clean_recipe(recipe)

        # Print summary
        print(f"\n\n{'='*80}")
        print(f"Cleanup Summary")
        print(f"{'='*80}")
        print(f"Total recipes: {self.stats['total']}")
        print(f"With URL marker: {self.stats['with_url']}")
        print(f"Cleaned: {self.stats['cleaned']}")
        print(f"Failed: {self.stats['failed']}")
        print(f"Skipped (no URL): {self.stats['skipped']}")
        print(f"{'='*80}\n")

        if self.dry_run and self.stats['with_url'] > 0:
            print(f"⚠️  This was a DRY RUN. No changes were made.")
            print(f"To actually perform the cleanup, run without --dry-run flag\n")


async def main():
    parser = argparse.ArgumentParser(
        description='Remove auto-added URLs from Telegram recipe messages'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be changed without actually changing anything'
    )
    parser.add_argument(
        '--delay',
        type=float,
        default=1.5,
        help='Delay in seconds between updates (default: 1.5)'
    )

    args = parser.parse_args()

    # Create Flask app context
    app = create_app()

    with app.app_context():
        cleaner = RecipeURLCleaner(dry_run=args.dry_run, delay=args.delay)
        await cleaner.run()


if __name__ == '__main__':
    asyncio.run(main())
