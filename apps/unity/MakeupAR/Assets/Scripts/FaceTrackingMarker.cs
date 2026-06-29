using UnityEngine;
using UnityEngine.Rendering;

public sealed class FaceTrackingMarker : MonoBehaviour
{
    private const string MarkerRootName = "M1 Diagnostic Marker";

    [SerializeField] private Vector3 markerLocalPosition = new Vector3(0.0f, 0.0f, 0.08f);
    [SerializeField] private float sphereDiameterMeters = 0.04f;
    [SerializeField] private Vector3 barScaleMeters = new Vector3(0.12f, 0.01f, 0.01f);

    private void Awake()
    {
        if (!enabled)
        {
            return;
        }

        if (transform.Find(MarkerRootName) != null)
        {
            return;
        }

        GameObject markerRoot = new GameObject(MarkerRootName);
        markerRoot.transform.SetParent(transform, false);
        markerRoot.transform.localPosition = markerLocalPosition;
        markerRoot.transform.localRotation = Quaternion.identity;
        markerRoot.transform.localScale = Vector3.one;

        Material magenta = CreateMarkerMaterial("M1 Marker Magenta", new Color(1.0f, 0.0f, 0.85f, 1.0f));
        Material cyan = CreateMarkerMaterial("M1 Marker Cyan", new Color(0.0f, 0.95f, 1.0f, 1.0f));

        GameObject sphere = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        sphere.name = "Face Center Magenta Dot";
        sphere.transform.SetParent(markerRoot.transform, false);
        sphere.transform.localScale = Vector3.one * sphereDiameterMeters;
        ConfigureRenderer(sphere, magenta);

        GameObject horizontalBar = GameObject.CreatePrimitive(PrimitiveType.Cube);
        horizontalBar.name = "Face Center Cyan Horizontal Bar";
        horizontalBar.transform.SetParent(markerRoot.transform, false);
        horizontalBar.transform.localScale = barScaleMeters;
        ConfigureRenderer(horizontalBar, cyan);

        GameObject verticalBar = GameObject.CreatePrimitive(PrimitiveType.Cube);
        verticalBar.name = "Face Center Cyan Vertical Bar";
        verticalBar.transform.SetParent(markerRoot.transform, false);
        verticalBar.transform.localScale = new Vector3(barScaleMeters.y, barScaleMeters.x, barScaleMeters.z);
        ConfigureRenderer(verticalBar, cyan);
    }

    private static Material CreateMarkerMaterial(string materialName, Color color)
    {
        Shader shader = Shader.Find("Universal Render Pipeline/Unlit");
        if (shader == null)
        {
            shader = Shader.Find("Unlit/Color");
        }

        if (shader == null)
        {
            shader = Shader.Find("Standard");
        }

        Material material = new Material(shader)
        {
            name = materialName,
            color = color,
            renderQueue = 5000
        };

        if (material.HasProperty("_BaseColor"))
        {
            material.SetColor("_BaseColor", color);
        }

        if (material.HasProperty("_Color"))
        {
            material.SetColor("_Color", color);
        }

        return material;
    }

    private static void ConfigureRenderer(GameObject markerObject, Material material)
    {
        Collider markerCollider = markerObject.GetComponent<Collider>();
        if (markerCollider != null)
        {
            Destroy(markerCollider);
        }

        Renderer renderer = markerObject.GetComponent<Renderer>();
        if (renderer == null)
        {
            return;
        }

        renderer.sharedMaterial = material;
        renderer.shadowCastingMode = ShadowCastingMode.Off;
        renderer.receiveShadows = false;
        renderer.allowOcclusionWhenDynamic = false;
        renderer.sortingOrder = 100;
    }
}
