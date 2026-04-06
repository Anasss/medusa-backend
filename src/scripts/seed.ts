import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresStep,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";
import { ApiKey } from "../../.medusa/types/query-entry-points";

const updateStoreCurrencies = createWorkflow(
  "update-store-currencies",
  (input: {
    supported_currencies: { currency_code: string; is_default?: boolean }[];
    store_id: string;
  }) => {
    const normalizedInput = transform({ input }, (data) => {
      return {
        selector: { id: data.input.store_id },
        update: {
          supported_currencies: data.input.supported_currencies.map(
            (currency) => {
              return {
                currency_code: currency.currency_code,
                is_default: currency.is_default ?? false,
              };
            }
          ),
        },
      };
    });

    const stores = updateStoresStep(normalizedInput);

    return new WorkflowResponse(stores);
  }
);

export default async function seedDemoData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const storeModuleService = container.resolve(Modules.STORE);

  const countries = ["gb", "de", "dk", "se", "fr", "es", "it", "us"];

  logger.info("Seeding store data...");
  const [store] = await storeModuleService.listStores();
  let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  });

  if (!defaultSalesChannel.length) {
    const { result: salesChannelResult } = await createSalesChannelsWorkflow(
      container
    ).run({
      input: {
        salesChannelsData: [
          {
            name: "Default Sales Channel",
          },
        ],
      },
    });
    defaultSalesChannel = salesChannelResult;
  }

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [
        {
          currency_code: "eur",
          is_default: true,
        },
        {
          currency_code: "usd",
        },
        {
          currency_code: "gbp",
        },
      ],
    },
  });

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_sales_channel_id: defaultSalesChannel[0].id,
      },
    },
  });

  logger.info("Seeding region data...");
  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Europe",
          currency_code: "eur",
          countries: ["gb", "de", "dk", "se", "fr", "es", "it"],
          payment_providers: ["pp_system_default"],
        },
        {
          name: "North America",
          currency_code: "usd",
          countries: ["us"],
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  });
  const europeRegion = regionResult[0];
  const naRegion = regionResult[1];
  logger.info("Finished seeding regions.");

  logger.info("Seeding tax regions...");
  await createTaxRegionsWorkflow(container).run({
    input: countries.map((country_code) => ({
      country_code,
      provider_id: "tp_system",
    })),
  });
  logger.info("Finished seeding tax regions.");

  logger.info("Seeding stock location data...");
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "Doqaland Store Distribution Center",
          address: {
            city: "Amsterdam",
            country_code: "NL",
            address_1: "Keizersgracht 520",
          },
        },
      ],
    },
  });
  const stockLocation = stockLocationResult[0];

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_location_id: stockLocation.id,
      },
    },
  });

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_provider_id: "manual_manual",
    },
  });

  logger.info("Seeding fulfillment data...");
  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  });
  let shippingProfile = shippingProfiles.length ? shippingProfiles[0] : null;

  if (!shippingProfile) {
    const { result: shippingProfileResult } =
      await createShippingProfilesWorkflow(container).run({
        input: {
          data: [
            {
              name: "Default Shipping Profile",
              type: "default",
            },
          ],
        },
      });
    shippingProfile = shippingProfileResult[0];
  }

  const allCountryGeoZones = countries.map((country_code) => ({
    country_code,
    type: "country" as const,
  }));

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "Doqaland Store Global Shipping",
    type: "shipping",
    service_zones: [
      {
        name: "Worldwide",
        geo_zones: allCountryGeoZones,
      },
    ],
  });

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_set_id: fulfillmentSet.id,
    },
  });

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standard Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Delivered in 3-5 business days.",
          code: "standard",
        },
        prices: [
          { currency_code: "usd", amount: 5_99 },
          { currency_code: "eur", amount: 4_99 },
          { currency_code: "gbp", amount: 4_49 },
          { region_id: europeRegion.id, amount: 4_99 },
          { region_id: naRegion.id, amount: 5_99 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
      {
        name: "Express Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Express",
          description: "Delivered in 1-2 business days.",
          code: "express",
        },
        prices: [
          { currency_code: "usd", amount: 14_99 },
          { currency_code: "eur", amount: 12_99 },
          { currency_code: "gbp", amount: 11_49 },
          { region_id: europeRegion.id, amount: 12_99 },
          { region_id: naRegion.id, amount: 14_99 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
      {
        name: "Free Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Free",
          description: "Free shipping on orders over €75. Delivered in 5-7 business days.",
          code: "free",
        },
        prices: [
          { currency_code: "usd", amount: 0 },
          { currency_code: "eur", amount: 0 },
          { currency_code: "gbp", amount: 0 },
          { region_id: europeRegion.id, amount: 0 },
          { region_id: naRegion.id, amount: 0 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
    ],
  });
  logger.info("Finished seeding fulfillment data.");

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding stock location data.");

  logger.info("Seeding publishable API key data...");
  let publishableApiKey: ApiKey | null = null;
  const { data } = await query.graph({
    entity: "api_key",
    fields: ["id"],
    filters: {
      type: "publishable",
    },
  });

  publishableApiKey = data?.[0];

  if (!publishableApiKey) {
    const {
      result: [publishableApiKeyResult],
    } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          {
            title: "Doqaland Store Storefront",
            type: "publishable",
            created_by: "",
          },
        ],
      },
    });

    publishableApiKey = publishableApiKeyResult as ApiKey;
  }

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding publishable API key data.");

  logger.info("Seeding product data...");

  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: {
      product_categories: [
        { name: "T-Shirts", is_active: true },
        { name: "Shirts", is_active: true },
        { name: "Sweatshirts & Hoodies", is_active: true },
        { name: "Pants & Jeans", is_active: true },
        { name: "Jackets & Coats", is_active: true },
        { name: "Accessories", is_active: true },
        { name: "Footwear", is_active: true },
        { name: "Activewear", is_active: true },
      ],
    },
  });

  const cat = (name: string) =>
    categoryResult.find((c) => c.name === name)!.id;

  const sc = [{ id: defaultSalesChannel[0].id }];

  // Product images served from the storefront's public folder
  const img = (name: string) =>
    `http://localhost:8000/products/${name}`;

  await createProductsWorkflow(container).run({
    input: {
      products: [
        // 1. Essential Crew Neck Tee
        {
          title: "Essential Crew Neck Tee",
          category_ids: [cat("T-Shirts")],
          description:
            "A wardrobe staple reimagined. Cut from premium 100% organic cotton with a relaxed fit that drapes beautifully. Pre-washed for softness from the first wear.",
          handle: "essential-crew-tee",
          weight: 200,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: img("crew-tee-1.jpg") },
            { url: img("crew-tee-2.jpg") },
          ],
          options: [
            { title: "Size", values: ["XS", "S", "M", "L", "XL", "XXL"] },
            { title: "Color", values: ["Black", "White"] },
          ],
          variants: [
            { title: "XS / Black", sku: "CREW-TEE-XS-BLK", options: { Size: "XS", Color: "Black" }, prices: [{ amount: 58, currency_code: "eur" }, { amount: 63, currency_code: "usd" }] },
            { title: "S / Black", sku: "CREW-TEE-S-BLK", options: { Size: "S", Color: "Black" }, prices: [{ amount: 58, currency_code: "eur" }, { amount: 63, currency_code: "usd" }] },
            { title: "M / Black", sku: "CREW-TEE-M-BLK", options: { Size: "M", Color: "Black" }, prices: [{ amount: 58, currency_code: "eur" }, { amount: 63, currency_code: "usd" }] },
            { title: "L / Black", sku: "CREW-TEE-L-BLK", options: { Size: "L", Color: "Black" }, prices: [{ amount: 58, currency_code: "eur" }, { amount: 63, currency_code: "usd" }] },
            { title: "XL / Black", sku: "CREW-TEE-XL-BLK", options: { Size: "XL", Color: "Black" }, prices: [{ amount: 58, currency_code: "eur" }, { amount: 63, currency_code: "usd" }] },
            { title: "XXL / Black", sku: "CREW-TEE-XXL-BLK", options: { Size: "XXL", Color: "Black" }, prices: [{ amount: 58, currency_code: "eur" }, { amount: 63, currency_code: "usd" }] },
            { title: "XS / White", sku: "CREW-TEE-XS-WHT", options: { Size: "XS", Color: "White" }, prices: [{ amount: 58, currency_code: "eur" }, { amount: 63, currency_code: "usd" }] },
            { title: "S / White", sku: "CREW-TEE-S-WHT", options: { Size: "S", Color: "White" }, prices: [{ amount: 58, currency_code: "eur" }, { amount: 63, currency_code: "usd" }] },
            { title: "M / White", sku: "CREW-TEE-M-WHT", options: { Size: "M", Color: "White" }, prices: [{ amount: 58, currency_code: "eur" }, { amount: 63, currency_code: "usd" }] },
            { title: "L / White", sku: "CREW-TEE-L-WHT", options: { Size: "L", Color: "White" }, prices: [{ amount: 58, currency_code: "eur" }, { amount: 63, currency_code: "usd" }] },
            { title: "XL / White", sku: "CREW-TEE-XL-WHT", options: { Size: "XL", Color: "White" }, prices: [{ amount: 58, currency_code: "eur" }, { amount: 63, currency_code: "usd" }] },
            { title: "XXL / White", sku: "CREW-TEE-XXL-WHT", options: { Size: "XXL", Color: "White" }, prices: [{ amount: 58, currency_code: "eur" }, { amount: 63, currency_code: "usd" }] },
          ],
          sales_channels: sc,
        },

        // 2. Heritage Vintage Sweatshirt
        {
          title: "Heritage Vintage Sweatshirt",
          category_ids: [cat("Sweatshirts & Hoodies")],
          description:
            "Inspired by 1970s athletic wear. Heavyweight 400gsm French terry with raglan sleeves and ribbed cuffs. Enzyme-washed for a perfectly lived-in feel.",
          handle: "heritage-vintage-sweatshirt",
          weight: 550,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: img("sweatshirt-1.jpg") },
            { url: img("sweatshirt-2.jpg") },
          ],
          options: [
            { title: "Size", values: ["S", "M", "L", "XL"] },
          ],
          variants: [
            { title: "S", sku: "HRTG-SWEAT-S", options: { Size: "S" }, prices: [{ amount: 85, currency_code: "eur" }, { amount: 92, currency_code: "usd" }] },
            { title: "M", sku: "HRTG-SWEAT-M", options: { Size: "M" }, prices: [{ amount: 85, currency_code: "eur" }, { amount: 92, currency_code: "usd" }] },
            { title: "L", sku: "HRTG-SWEAT-L", options: { Size: "L" }, prices: [{ amount: 85, currency_code: "eur" }, { amount: 92, currency_code: "usd" }] },
            { title: "XL", sku: "HRTG-SWEAT-XL", options: { Size: "XL" }, prices: [{ amount: 85, currency_code: "eur" }, { amount: 92, currency_code: "usd" }] },
          ],
          sales_channels: sc,
        },

        // 3. Slim Fit Chinos
        {
          title: "Slim Fit Chinos",
          category_ids: [cat("Pants & Jeans")],
          description:
            "Tailored from stretch cotton twill with a slim silhouette that moves with you. Features a mid-rise waist, slant pockets, and a clean flat front. Perfect for the office or a night out.",
          handle: "slim-fit-chinos",
          weight: 450,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: img("chinos-1.jpg") },
            { url: img("chinos-2.jpg") },
          ],
          options: [
            { title: "Size", values: ["28", "30", "32", "34", "36"] },
          ],
          variants: [
            { title: "28", sku: "CHINO-28", options: { Size: "28" }, prices: [{ amount: 72, currency_code: "eur" }, { amount: 78, currency_code: "usd" }] },
            { title: "30", sku: "CHINO-30", options: { Size: "30" }, prices: [{ amount: 72, currency_code: "eur" }, { amount: 78, currency_code: "usd" }] },
            { title: "32", sku: "CHINO-32", options: { Size: "32" }, prices: [{ amount: 72, currency_code: "eur" }, { amount: 78, currency_code: "usd" }] },
            { title: "34", sku: "CHINO-34", options: { Size: "34" }, prices: [{ amount: 72, currency_code: "eur" }, { amount: 78, currency_code: "usd" }] },
            { title: "36", sku: "CHINO-36", options: { Size: "36" }, prices: [{ amount: 72, currency_code: "eur" }, { amount: 78, currency_code: "usd" }] },
          ],
          sales_channels: sc,
        },

        // 5. Oversized Hoodie
        {
          title: "Oversized Hoodie",
          category_ids: [cat("Sweatshirts & Hoodies")],
          description:
            "The ultimate cozy layer. Heavyweight brushed fleece with a generous oversized fit, kangaroo pocket, and adjustable drawcord hood. Double-stitched seams for lasting durability.",
          handle: "oversized-hoodie",
          weight: 650,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: img("hoodie-1.jpg") },
            { url: img("hoodie-2.jpg") },
          ],
          options: [
            { title: "Size", values: ["S", "M", "L", "XL"] },
          ],
          variants: [
            { title: "S", sku: "OVRSZ-HOOD-S", options: { Size: "S" }, prices: [{ amount: 95, currency_code: "eur" }, { amount: 105, currency_code: "usd" }] },
            { title: "M", sku: "OVRSZ-HOOD-M", options: { Size: "M" }, prices: [{ amount: 95, currency_code: "eur" }, { amount: 105, currency_code: "usd" }] },
            { title: "L", sku: "OVRSZ-HOOD-L", options: { Size: "L" }, prices: [{ amount: 95, currency_code: "eur" }, { amount: 105, currency_code: "usd" }] },
            { title: "XL", sku: "OVRSZ-HOOD-XL", options: { Size: "XL" }, prices: [{ amount: 95, currency_code: "eur" }, { amount: 105, currency_code: "usd" }] },
          ],
          sales_channels: sc,
        },

        // 6. Oxford Button-Down Shirt
        {
          title: "Oxford Button-Down Shirt",
          category_ids: [cat("Shirts")],
          description:
            "A refined classic. Woven from premium long-staple cotton oxford cloth with a button-down collar and a slightly tapered fit. Single chest pocket with embroidered logo detail.",
          handle: "oxford-button-down",
          weight: 300,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: img("oxford-shirt-1.jpg") },
            { url: img("oxford-shirt-2.jpg") },
          ],
          options: [
            { title: "Size", values: ["S", "M", "L", "XL"] },
          ],
          variants: [
            { title: "S", sku: "OXFORD-S", options: { Size: "S" }, prices: [{ amount: 78, currency_code: "eur" }, { amount: 85, currency_code: "usd" }] },
            { title: "M", sku: "OXFORD-M", options: { Size: "M" }, prices: [{ amount: 78, currency_code: "eur" }, { amount: 85, currency_code: "usd" }] },
            { title: "L", sku: "OXFORD-L", options: { Size: "L" }, prices: [{ amount: 78, currency_code: "eur" }, { amount: 85, currency_code: "usd" }] },
            { title: "XL", sku: "OXFORD-XL", options: { Size: "XL" }, prices: [{ amount: 78, currency_code: "eur" }, { amount: 85, currency_code: "usd" }] },
          ],
          sales_channels: sc,
        },

        // 10. Wool Blend Overcoat
        {
          title: "Wool Blend Overcoat",
          category_ids: [cat("Jackets & Coats")],
          description:
            "A cold-weather investment piece. Tailored from Italian wool-cashmere blend with a notch lapel, two-button closure, and fully lined interior. Mid-thigh length with deep interior pockets.",
          handle: "wool-blend-overcoat",
          weight: 1200,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: img("overcoat-1.jpg") },
            { url: img("overcoat-2.jpg") },
          ],
          options: [
            { title: "Size", values: ["S", "M", "L", "XL"] },
          ],
          variants: [
            { title: "S", sku: "OVERCOAT-S", options: { Size: "S" }, prices: [{ amount: 120, currency_code: "eur" }, { amount: 129, currency_code: "usd" }] },
            { title: "M", sku: "OVERCOAT-M", options: { Size: "M" }, prices: [{ amount: 120, currency_code: "eur" }, { amount: 129, currency_code: "usd" }] },
            { title: "L", sku: "OVERCOAT-L", options: { Size: "L" }, prices: [{ amount: 120, currency_code: "eur" }, { amount: 129, currency_code: "usd" }] },
            { title: "XL", sku: "OVERCOAT-XL", options: { Size: "XL" }, prices: [{ amount: 120, currency_code: "eur" }, { amount: 129, currency_code: "usd" }] },
          ],
          sales_channels: sc,
        },

        // 11. Canvas Tote Bag
        {
          title: "Canvas Tote Bag",
          category_ids: [cat("Accessories")],
          description:
            "Your everyday carry-all. Heavy-duty 16oz waxed canvas with reinforced leather handles and a brass zipper closure. Interior laptop sleeve fits up to 15\". Dimensions: 40cm x 35cm x 12cm.",
          handle: "canvas-tote-bag",
          weight: 600,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: img("tote-bag-1.jpg") },
            { url: img("tote-bag-2.jpg") },
          ],
          options: [
            { title: "Color", values: ["Natural", "Olive"] },
          ],
          variants: [
            { title: "Natural", sku: "TOTE-NAT", options: { Color: "Natural" }, prices: [{ amount: 58, currency_code: "eur" }, { amount: 63, currency_code: "usd" }] },
            { title: "Olive", sku: "TOTE-OLV", options: { Color: "Olive" }, prices: [{ amount: 58, currency_code: "eur" }, { amount: 63, currency_code: "usd" }] },
          ],
          sales_channels: sc,
        },

        // 12. Leather Minimalist Belt
        {
          title: "Leather Minimalist Belt",
          category_ids: [cat("Accessories")],
          description:
            "Handcrafted from full-grain Italian vegetable-tanned leather with a brushed nickel buckle. 3cm width. Will develop a beautiful patina over time. Available in three lengths.",
          handle: "leather-minimalist-belt",
          weight: 200,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: img("belt-1.jpg") },
            { url: img("belt-2.jpg") },
          ],
          options: [
            { title: "Size", values: ["S (80cm)", "M (90cm)", "L (100cm)"] },
          ],
          variants: [
            { title: "S (80cm)", sku: "BELT-S", options: { Size: "S (80cm)" }, prices: [{ amount: 68, currency_code: "eur" }, { amount: 75, currency_code: "usd" }] },
            { title: "M (90cm)", sku: "BELT-M", options: { Size: "M (90cm)" }, prices: [{ amount: 68, currency_code: "eur" }, { amount: 75, currency_code: "usd" }] },
            { title: "L (100cm)", sku: "BELT-L", options: { Size: "L (100cm)" }, prices: [{ amount: 68, currency_code: "eur" }, { amount: 75, currency_code: "usd" }] },
          ],
          sales_channels: sc,
        },

        // 13. V-Neck Merino Sweater
        {
          title: "V-Neck Merino Sweater",
          category_ids: [cat("Sweatshirts & Hoodies")],
          description:
            "Luxuriously soft extra-fine merino wool in a timeless V-neck silhouette. Lightweight enough to layer under a blazer, warm enough to wear on its own. Machine washable.",
          handle: "vneck-merino-sweater",
          weight: 350,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: img("merino-sweater-1.jpg") },
            { url: img("merino-sweater-2.jpg") },
          ],
          options: [
            { title: "Size", values: ["S", "M", "L", "XL"] },
          ],
          variants: [
            { title: "S", sku: "MERINO-V-S", options: { Size: "S" }, prices: [{ amount: 110, currency_code: "eur" }, { amount: 119, currency_code: "usd" }] },
            { title: "M", sku: "MERINO-V-M", options: { Size: "M" }, prices: [{ amount: 110, currency_code: "eur" }, { amount: 119, currency_code: "usd" }] },
            { title: "L", sku: "MERINO-V-L", options: { Size: "L" }, prices: [{ amount: 110, currency_code: "eur" }, { amount: 119, currency_code: "usd" }] },
            { title: "XL", sku: "MERINO-V-XL", options: { Size: "XL" }, prices: [{ amount: 110, currency_code: "eur" }, { amount: 119, currency_code: "usd" }] },
          ],
          sales_channels: sc,
        },

        // 14. Lightweight Puffer Jacket
        {
          title: "Lightweight Puffer Jacket",
          category_ids: [cat("Jackets & Coats")],
          description:
            "Warmth without the bulk. Filled with responsibly sourced 700-fill duck down, with a water-resistant ripstop nylon shell. Packs into its own internal pocket for easy travel.",
          handle: "lightweight-puffer-jacket",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: img("puffer-jacket-1.jpg") },
            { url: img("puffer-jacket-2.jpg") },
          ],
          options: [
            { title: "Size", values: ["S", "M", "L", "XL"] },
          ],
          variants: [
            { title: "S", sku: "PUFFER-S", options: { Size: "S" }, prices: [{ amount: 115, currency_code: "eur" }, { amount: 125, currency_code: "usd" }] },
            { title: "M", sku: "PUFFER-M", options: { Size: "M" }, prices: [{ amount: 115, currency_code: "eur" }, { amount: 125, currency_code: "usd" }] },
            { title: "L", sku: "PUFFER-L", options: { Size: "L" }, prices: [{ amount: 115, currency_code: "eur" }, { amount: 125, currency_code: "usd" }] },
            { title: "XL", sku: "PUFFER-XL", options: { Size: "XL" }, prices: [{ amount: 115, currency_code: "eur" }, { amount: 125, currency_code: "usd" }] },
          ],
          sales_channels: sc,
        },

        // 15. Canvas Low-Top Sneakers
        {
          title: "Canvas Low-Top Sneakers",
          category_ids: [cat("Footwear")],
          description:
            "Clean and classic. Organic cotton canvas upper with a vulcanized rubber sole for all-day comfort. Ortholite insole provides cushioning and moisture management.",
          handle: "canvas-low-top-sneakers",
          weight: 700,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: img("sneakers-1.jpg") },
            { url: img("sneakers-2.jpg") },
          ],
          options: [
            { title: "Size", values: ["EU 39", "EU 40", "EU 41", "EU 42", "EU 43", "EU 44"] },
          ],
          variants: [
            { title: "EU 39", sku: "SNKR-39", options: { Size: "EU 39" }, prices: [{ amount: 85, currency_code: "eur" }, { amount: 92, currency_code: "usd" }] },
            { title: "EU 40", sku: "SNKR-40", options: { Size: "EU 40" }, prices: [{ amount: 85, currency_code: "eur" }, { amount: 92, currency_code: "usd" }] },
            { title: "EU 41", sku: "SNKR-41", options: { Size: "EU 41" }, prices: [{ amount: 85, currency_code: "eur" }, { amount: 92, currency_code: "usd" }] },
            { title: "EU 42", sku: "SNKR-42", options: { Size: "EU 42" }, prices: [{ amount: 85, currency_code: "eur" }, { amount: 92, currency_code: "usd" }] },
            { title: "EU 43", sku: "SNKR-43", options: { Size: "EU 43" }, prices: [{ amount: 85, currency_code: "eur" }, { amount: 92, currency_code: "usd" }] },
            { title: "EU 44", sku: "SNKR-44", options: { Size: "EU 44" }, prices: [{ amount: 85, currency_code: "eur" }, { amount: 92, currency_code: "usd" }] },
          ],
          sales_channels: sc,
        },

        // 16. Training Shorts
        {
          title: "Training Shorts",
          category_ids: [cat("Activewear")],
          description:
            "Built for high-intensity workouts. Quick-dry stretch fabric with mesh ventilation panels and a secure zip pocket at the back. 5\" inseam with built-in liner.",
          handle: "training-shorts",
          weight: 180,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: img("training-shorts-1.jpg") },
            { url: img("training-shorts-2.jpg") },
          ],
          options: [
            { title: "Size", values: ["S", "M", "L", "XL"] },
          ],
          variants: [
            { title: "S", sku: "TRAIN-SHORT-S", options: { Size: "S" }, prices: [{ amount: 42, currency_code: "eur" }, { amount: 46, currency_code: "usd" }] },
            { title: "M", sku: "TRAIN-SHORT-M", options: { Size: "M" }, prices: [{ amount: 42, currency_code: "eur" }, { amount: 46, currency_code: "usd" }] },
            { title: "L", sku: "TRAIN-SHORT-L", options: { Size: "L" }, prices: [{ amount: 42, currency_code: "eur" }, { amount: 46, currency_code: "usd" }] },
            { title: "XL", sku: "TRAIN-SHORT-XL", options: { Size: "XL" }, prices: [{ amount: 42, currency_code: "eur" }, { amount: 46, currency_code: "usd" }] },
          ],
          sales_channels: sc,
        },
      ],
    },
  });
  logger.info("Finished seeding product data.");

  logger.info("Seeding inventory levels.");

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  });

  const inventoryLevels: CreateInventoryLevelInput[] = [];
  for (const inventoryItem of inventoryItems) {
    const inventoryLevel = {
      location_id: stockLocation.id,
      stocked_quantity: 500,
      inventory_item_id: inventoryItem.id,
    };
    inventoryLevels.push(inventoryLevel);
  }

  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: inventoryLevels,
    },
  });

  logger.info("Finished seeding inventory levels data.");
}
